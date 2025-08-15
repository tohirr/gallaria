export default async function handler(req, res) {
  const SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbzJi2OEYZNfvrYYwe2luW9wxIK9uIdaL_cwr7hldGS7F7eLUzwG9ObLWP1GrCgmtRwbWg/exec";
  if (req.method === "POST") {
    try {
      const resp = await fetch(SHEET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await resp.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "GET") {
    try {
      const resp = await fetch(SHEET_API_URL);
      const data = await resp.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
