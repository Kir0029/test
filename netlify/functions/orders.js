exports.handler = async (event, context) => {
  try {
    const res = await fetch('https://test.ooobs.ru/api/orders');
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: `Failed to fetch orders: ${res.statusText}` })
      };
    }

    const rawOrders = await res.json();

    function normalizePhone(raw) {
      if (raw === null || raw === undefined) return null;
      const str = String(raw).trim();
      const digits = str.replace(/\D/g, '');
      if (digits.length === 10) {
        return '+7' + digits;
      }
      if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
        return '+7' + digits.slice(1);
      }
      return null;
    }

    const received = rawOrders.length;
    let invalid_dropped = 0;
    const groups = new Map();

    for (const item of rawOrders) {
      const phone = normalizePhone(item.phone);
      if (!phone) {
        invalid_dropped++;
        continue;
      }
      if (!groups.has(phone)) {
        groups.set(phone, []);
      }
      groups.get(phone).push(item);
    }

    const clients = [];
    let duplicates_merged = 0;

    for (const [phone, items] of groups.entries()) {
      if (items.length > 1) {
        duplicates_merged += (items.length - 1);
      }

      // Правило при дубле: оставить запись с максимальным amount; при равных amount — более позднюю по created_at
      items.sort((a, b) => {
        const amountA = Number(a.amount) || 0;
        const amountB = Number(b.amount) || 0;
        if (amountB !== amountA) {
          return amountB - amountA;
        }
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeB - timeA;
      });

      const chosen = items[0];
      clients.push({
        name: chosen.name ?? '',
        phone: phone,
        email: chosen.email ?? '',
        amount: typeof chosen.amount === 'number' ? chosen.amount : (Number(chosen.amount) || 0)
      });
    }

    const responseData = {
      clients: clients,
      stats: {
        received: received,
        unique: clients.length,
        duplicates_merged: duplicates_merged,
        invalid_dropped: invalid_dropped
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(responseData, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
