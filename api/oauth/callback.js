export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing ?code in URL");
  }

  // Get tokens from Zoho
  const client_id = process.env.ZOHO_CLIENT_ID;
  const client_secret = process.env.ZOHO_CLIENT_SECRET;

  const tokenUrl = `https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=${client_id}&client_secret=${client_secret}&redirect_uri=https://easyquote-zoho.vercel.app/api/oauth/callback&code=${code}`;

  try {
    const response = await fetch(tokenUrl, { method: "POST" });
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error, details: data });
    }

    // Show tokens in browser (for now)
    return res.status(200).json({
      message: "OAuth Success",
      tokens: data,
    });
  } catch (err) {
    return res.status(500).json({ error: "OAuth callback failed", details: err.message });
  }
}
