export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }
  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });

  const body = req.body || {};
  let targetList = [];
  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => typeof u === 'string' ? u.trim() : '').filter(Boolean);
  } else if (typeof body.uid === 'string' && body.uid.trim()) {
    targetList = [body.uid.trim()];
  }

  const DEFAULT_5UIDS = [
    "cad0a30e-eda3-46b3-a30c-ce71ee898db9",
    "d434faf1-51ab-48ae-9b2f-e48ea4f699aa",
    "e0c9e631-a143-467e-866e-fbd77e283816",
    "6d7867e6-9abb-4f76-9cb4-85e146eee486",
    "f27c937e-a7ae-4bf6-9455-9c7af9d3428f"
  ];
  if (targetList.length === 0) targetList = DEFAULT_5UIDS;
  const amount = Number(body.amount) || 1;

  async function piFetch(path, method = "GET", payload) {
    // CHUẨN TESTNET 100%
    const r = await fetch(`https://api.testnet.minepi.com${path}`, {
      method,
      headers: {
        Authorization: `Key ${PI_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0,3000)}; }
    return { ok: r.ok, status: r.status, data };
  }

  async function cancelOngoingIfFound(piErrorData) {
    try {
      let paymentId = null;
      if (piErrorData?.payment?.identifier) paymentId = piErrorData.payment.identifier;
      if (!paymentId && piErrorData?.identifier) paymentId = piErrorData.identifier;
      if (!paymentId && piErrorData?.ongoing_payment?.identifier) paymentId = piErrorData.ongoing_payment.identifier;
      if (!paymentId) {
        const inc = await piFetch("/v2/payments/incomplete", "GET");
        const list = inc.data?.incomplete_payments || inc.data || [];
        if (Array.isArray(list) && list.length > 0) paymentId = list[0].identifier;
      }
      if (paymentId) {
        let result = await piFetch(`/v2/payments/${paymentId}/complete`, "POST", { txid: "a2u_retry_complete" });
        if (!result.ok) result = await piFetch(`/v2/payments/${paymentId}/cancel`, "POST");
        return { cancelled: result.ok, paymentId };
      }
    } catch (e) {}
    return { cancelled: false };
  }

  const results = [];
  for (let i = 0; i < targetList.length; i++) {
    const uid = targetList[i];
    let attempt = 0;
    let finalResult = null;
    while (attempt < 3) {
      attempt++;
      const piPayload = {
        payment: {
          amount,
          memo: `Spa Khai Hoan Testnet A2U @${uid.substring(0,6)} ${i+1}/${targetList.length}`,
          metadata: { target_uid: uid, batch_index: i, attempt, app: "spakhaihoan", env: "testnet" },
          uid,
        },
      };
      const piResponse = await piFetch("/v2/payments", "POST", piPayload);
      if (piResponse.ok) {
        finalResult = { uid, success: true, pi_response: piResponse.data, attempts: attempt };
        break;
      } else {
        const errStr = JSON.stringify(piResponse.data).toLowerCase();
        if (errStr.includes("ongoing_payment_found") || errStr.includes("ongoing payment")) {
          const cancelRes = await cancelOngoingIfFound(piResponse.data);
          if (cancelRes.cancelled) { finalResult = { retrying: true }; continue; }
          else { finalResult = { uid, success: false, error: "ongoing_payment_found", details: piResponse.data, status: piResponse.status }; break; }
        } else {
          finalResult = { uid, success: false, error: "Pi API rejected", details: piResponse.data, status: piResponse.status, attempts: attempt };
          break;
        }
      }
    }
    if (finalResult?.retrying) {
      const lastPayload = { payment: { amount, memo: `Spa Khai Hoan Retry ${uid}`, metadata: { target_uid: uid }, uid } };
      const lastResp = await piFetch("/v2/payments", "POST", lastPayload);
      finalResult = lastResp.ok ? { uid, success: true, pi_response: lastResp.data } : { uid, success: false, error: "Failed after cancel", details: lastResp.data };
    }
    results.push(finalResult);
    if (i < targetList.length - 1) await new Promise(r => setTimeout(r, 800));
  }
  const allOk = results.every(r => r.success);
  return res.status(allOk ? 200 : 207).json({ success: allOk, total: results.length, results, note: "spakhaihoan testnet 100% - api.testnet.minepi.com + auto cancel" });
}
