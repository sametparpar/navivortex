// api/search.js
// Bu kod Vercel üzerinde "Serverless Function" olarak çalışır.

// Veriyi hafızada tutmak için (Cache)
// Böylece her aramada GitHub'a gidip dosyayı tekrar indirmez, hızlı çalışır.
let cachedAirports = null;

export default async function handler(request, response) {
    // 1. Arama sorgusunu al (Örn: ?q=SAW)
    const { q } = request.query;

    if (!q || q.length < 2) {
        return response.status(200).json([]);
    }

    const query = q.toUpperCase();

    // 2. Veritabanı Cache'te yoksa GitHub'dan çek (Sadece ilk seferde çalışır)
    if (!cachedAirports) {
        try {
            console.log("Fetching DB from GitHub...");
            // Başkalarının güncellediği canlı listeyi çekiyoruz
            const res = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
            cachedAirports = await res.json();
        } catch (error) {
            return response.status(500).json({ error: "Database fetch failed" });
        }
    }

    // 3. Arama Yap (Server Side Searching)
    const results = [];
    let count = 0;

    for (const [icao, data] of Object.entries(cachedAirports)) {
        if (count >= 5) break; // Sadece en iyi 5 sonucu döndür

        // ICAO (LTFJ), IATA (SAW), İsim (Sabiha) veya Şehir (Istanbul) eşleşiyor mu?
        const matchCode = icao.includes(query);
        const matchIata = data.iata && data.iata.includes(query);
        const matchName = data.name.toUpperCase().includes(query);
        const matchCity = data.city && data.city.toUpperCase().includes(query);

        if (matchCode || matchIata || matchName || matchCity) {
            results.push({
                icao: icao,
                iata: data.iata || "",
                name: data.name,
                lat: data.lat,
                lon: data.lon,
                alt: data.elevation,
                city: data.city,
                country: data.country
            });
            count++;
        }
    }

    // 4. Sonucu Gönder
    // CORS ayarları (Her yerden erişilebilsin diye)
    response.setHeader('Access-Control-Allow-Credentials', true);
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    return response.status(200).json(results);
}
