// 1. CesiumJS Haritasını Başlat
const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: Cesium.createWorldTerrain(),
    baseLayerPicker: false,
    navigationHelpButton: false,
    homeButton: false,
    sceneModePicker: true
});

let waypoints = []; // Rota noktalarını tutacak dizi

// 2. Dinamik Menü Oluşturucu (config.js'deki veriye göre)
function buildDynamicMenu() {
    const selected = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[selected];
    const container = document.getElementById('dynamic-inputs-container');
    
    // Mevcut inputları temizle
    container.innerHTML = ""; 

    // Seçilen aracın inputlarını oluştur
    config.inputs.forEach(input => {
        const div = document.createElement('div');
        div.className = 'input-group';
        div.innerHTML = `
            <label>${input.label}</label>
            <input type="number" id="${input.id}" value="${input.value}" onchange="calculateLogistics()">
        `;
        container.appendChild(div);
    });

    // Araç değişince hesaplamayı güncelle
    calculateLogistics();
}

// 3. Lojistik ve Yakıt/Pil Hesaplama Motoru
function calculateLogistics() {
    if (waypoints.length < 1) {
        document.getElementById('total-stats').innerText = "Rotaları belirlemek için haritaya tıklayın.";
        return;
    }

    const vehicleId = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[vehicleId];
    const alertBox = document.getElementById('energy-alert');
    const headwind = parseFloat(document.getElementById('uav-wind').value || 0);
    
    // Sayfadaki değerleri ID'ye göre çekmek için yardımcı fonksiyon
    const getVal = (id) => parseFloat(document.getElementById(id).value || 0);
    
    let totalCapacity, groundSpeed, hourlyRate;

    if (config.isElectric) {
        totalCapacity = getVal('drone-bat');
        groundSpeed = getVal('drone-speed');
    } else {
        totalCapacity = getVal('fuel-cap');
        groundSpeed = getVal('fuel-speed');
        hourlyRate = getVal('fuel-rate');
    }

    let currentEnergy = totalCapacity;
    let failPointIndex = -1;
    let accumulatedTime = 0; // Saat cinsinden

    for (let i = 1; i < waypoints.length; i++) {
        const distMeters = Cesium.Cartesian3.distance(waypoints[i-1].cartesian, waypoints[i].cartesian);
        const effectiveSpeed = groundSpeed - headwind;
        let legTime, consumption;

        if (config.isElectric) {
            // Drone: saniye/metre hesabı (m/s)
            legTime = distMeters / (effectiveSpeed > 0 ? effectiveSpeed : 1);
            const weight = getVal('drone-weight');
            // Basit enerji tüketim modeli: (Ağırlık * Mesafe) + (Zaman Etkisi)
            consumption = (weight * distMeters * 0.0008) + (legTime / 60 * 5);
        } else {
            // Uçak/Heli: Deniz mili (NM) hesabı
            const distNM = distMeters * 0.000539957;
            legTime = distNM / (effectiveSpeed > 0 ? effectiveSpeed : 1);
            consumption = hourlyRate * legTime;
        }

        accumulatedTime += legTime;
        currentEnergy -= consumption;

        if (currentEnergy <= 0 && failPointIndex === -1) {
            failPointIndex = i;
        }
    }

    // Arayüzü Güncelle (Hata Mesajı)
    if (failPointIndex !== -1) {
        alertBox.style.display = "block";
        alertBox.innerText = `⚠️ ${config.isElectric ? 'BATARYA' : 'YAKIT'} YETERSİZ: WP #${failPointIndex + 1}`;
    } else {
        alertBox.style.display = "none";
    }

    // İstatistikleri Yazdır
    updateStatsUI(config.isElectric, accumulatedTime, groundSpeed);
}

// 4. Alt İstatistik Paneli Güncelleme
function updateStatsUI(isElectric, accumulatedTime, groundSpeed) {
    let distText, timeText;

    if (isElectric) {
        distText = `${((accumulatedTime * groundSpeed) / 1000).toFixed(2)} km`;
        timeText = `${(accumulatedTime / 60).toFixed(1)} dk`;
    } else {
        distText = `${(accumulatedTime * groundSpeed).toFixed(1)} NM`;
        timeText = `${(accumulatedTime * 60).toFixed(1)} dk`;
    }

    document.getElementById('total-stats').innerText = `Mesafe: ${distText} | Tahmini Süre: ${timeText}`;
}

// Sayfa yüklendiğinde varsayılan menüyü kur
window.onload = buildDynamicMenu;
