import { getZohoAccessToken, invalidateZohoToken } from "../lib/zohoAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { qid, action, comment, name } = req.body;
    if (!qid || !action) {
      return res.status(400).json({ error: "Missing qid or action" });
    }

    // Normalize action to CRM canonical values
    const norm = (s) => {
      const t = String(s || "").toLowerCase();
      if (t.startsWith("accept")) return "Accepted";
      if (t.startsWith("deny")) return "Denied";
      if (t.startsWith("nego")) return "Negotiated";
      return s;
    };
    const finalAction = norm(action);

    let accessToken = await getZohoAccessToken();

    // Helper: Zoho datetime (yyyy-MM-dd'T'HH:mm:ss)
    const formatZohoDate = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return (
        d.getFullYear() +
        "-" + pad(d.getMonth() + 1) +
        "-" + pad(d.getDate()) +
        "T" + pad(d.getHours()) +
        ":" + pad(d.getMinutes()) +
        ":" + pad(d.getSeconds())
      );
    };

    const updateMap = {
      Acceptance_Status: finalAction,  // "Accepted" / "Negotiated" / "Denied"
      Client_Response: comment || null,
      Acknowledged_By: name || null,
      ...(finalAction === "Accepted" || finalAction === "Denied"
        ? { Acceptance_Token_Expires: formatZohoDate(new Date()) }
        : {}),
    };

    const doUpdate = async () => {
      const crmResp = await fetch(`${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}`, {
        method: "PUT",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [updateMap] }),
      });
      const data = await crmResp.json();
      return { status: crmResp.status, data };
    };

    // First attempt
    let { data: crmData } = await doUpdate();

    // Retry once on INVALID_TOKEN
    if (
      (crmData?.code === "INVALID_TOKEN" ||
        crmData?.message === "invalid oauth token" ||
        crmData?.data?.[0]?.code === "INVALID_TOKEN") &&
      !req._retried
    ) {
      invalidateZohoToken();
      accessToken = await getZohoAccessToken();
      const second = await doUpdate();
      crmData = second.data;
    }

    const first = crmData?.data?.[0];
    if (first && first.code === "SUCCESS") {
      return res.status(200).json({ ok: true, action: finalAction, sent: updateMap });
    } else {
      return res.status(400).json({
        ok: false,
        message: "Zoho did not accept the update",
        sent: updateMap,
        crmRaw: crmData,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
