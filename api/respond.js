export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { qid, action, comment, name } = req.body;

    if (!qid || !action) {
      return res.status(400).json({ error: "Missing qid or action" });
    }

    // Normalize action
    const norm = (s) => {
      const t = String(s || "").toLowerCase();
      if (t.startsWith("accept")) return "Accepted";
      if (t.startsWith("deny")) return "Denied";
      if (t.startsWith("nego")) return "Negotiated";
      return s;
    };
    const finalAction = norm(action);

    // Step 1: Always refresh access token
    const tokenResp = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: "POST" }
    );
    const tokenData = await tokenResp.json();

    if (!tokenData.access_token) {
      return res.status(401).json({
        ok: false,
        error: "Failed to refresh Zoho token",
        raw: tokenData   // 👈 Show Zoho’s raw error reply
      });
    }

    const accessToken = tokenData.access_token;

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

    // Step 2: Build update map
    let updateMap = {
      Acceptance_Status: finalAction,
      Client_Response: comment || null,
      Acknowledged_By: name || null,
    };

    if (finalAction === "Accepted" || finalAction === "Denied") {
      updateMap.Acceptance_Token_Expires = formatZohoDate(new Date());
    }

    // Step 3: Update Quote
    const crmResp = await fetch(
      `${process.env.ZOHO_API_BASE}/crm/v2/Quotes/${qid}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [updateMap] }),
      }
    );

    const crmData = await crmResp.json();

    const first = crmData?.data?.[0];
    if (first && first.code === "SUCCESS") {
      return res.status(200).json({
        ok: true,
        action: finalAction,
        sent: updateMap
      });
    } else {
      return res.status(400).json({
        ok: false,
        message: "Zoho did not accept the update",
        sent: updateMap,
        crmRaw: crmData
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
