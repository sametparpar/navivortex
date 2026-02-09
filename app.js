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



// 5. Haritaya Tıklama Olayını Tanımla
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

handler.setInputAction((click) => {
    // Tıklanan koordinatı 3D uzayda yakala
    const pickedPosition = viewer.scene.pickPosition(click.position);
    
    if (Cesium.defined(pickedPosition)) {
        // Koordinatı Enlem/Boylam formatına çevir
        const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const alt = Math.round(cartographic.height + 50); // Varsayılan 50m yükseklik

        // Listeye ekle
        waypoints.push({
            lat: lat,
            lon: lon,
            alt: alt,
            cartesian: pickedPosition
        });

        // Görselleri ve UI'ı güncelle
        renderVisuals(-1); // Henüz hata yoksa -1 pasla
        updateUI();
        calculateLogistics();
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// 6. Rota Çizgilerini ve Noktaları Haritada Göster
let routeLineEntity = null;
let waypointEntities = [];

function renderVisuals(failIndex) {
    // Eskileri temizle
    if (routeLineEntity) viewer.entities.remove(routeLineEntity);
    waypointEntities.forEach(entity => viewer.entities.remove(entity));
    waypointEntities = [];

    const positions = waypoints.map(wp => wp.cartesian);

    if (positions.length > 1) {
        // Çizgiyi oluştur
        routeLineEntity = viewer.entities.add({
            polyline: {
                positions: positions,
                width: 4,
                material: Cesium.Color.fromCssColorString('#38bdf8'),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
    }

    // Noktaları (Pin) oluştur
    waypoints.forEach((wp, index) => {
        const pin = viewer.entities.add({
            position: wp.cartesian,
            point: {
                pixelSize: 10,
                color: (failIndex !== -1 && index >= failIndex) ? Cesium.Color.RED : Cesium.Color.fromCssColorString('#10b981'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2
            }
        });
        waypointEntities.push(pin);
    });
}

// 7. Sağ Paneldeki Tabloyu Güncelle (Nav Log)
function updateUI() {
    const listContainer = document.getElementById('wp-list');
    listContainer.innerHTML = ""; // Temizle

    waypoints.forEach((wp, i) => {
        const item = document.createElement('div');
        item.className = 'waypoint-item';
        item.innerHTML = `
            <b>WP #${i + 1}</b><br>
            LAT: ${wp.lat.toFixed(5)} | LON: ${wp.lon.toFixed(5)}<br>
            ALT: ${wp.alt}m
        `;
        listContainer.appendChild(item);
    });
}


// 8. Arama Izgarası Oluşturma (Search Grid)
function generateSearchGrid() {
    // Izgara oluşturmak için en az 2 nokta (başlangıç ve bitiş köşeleri) gerekli
    if (waypoints.length < 2) {
        alert("Izgara oluşturmak için haritada en az iki nokta (köşeler) belirleyin.");
        return;
    }

    const startWP = waypoints[0];
    const endWP = waypoints[waypoints.length - 1];

    const latMin = Math.min(startWP.lat, endWP.lat);
    const latMax = Math.max(startWP.lat, endWP.lat);
    const lonMin = Math.min(startWP.lon, endWP.lon);
    const lonMax = Math.max(startWP.lon, endWP.lon);

    // Izgara aralığı (Dronelar için yaklaşık 30-50 metre idealdir)
    const step = 0.0005; // Derece cinsinden yaklaşık mesafe
    const newWaypoints = [];
    let zigZag = true;

    for (let lat = latMin; lat <= latMax; lat += step) {
        if (zigZag) {
            // Soldan sağa
            for (let lon = lonMin; lon <= lonMax; lon += step) {
                addGridPoint(lat, lon, newWaypoints);
            }
        } else {
            // Sağdan sola (Yılanvari dönüş için)
            for (let lon = lonMax; lon >= lonMin; lon -= step) {
                addGridPoint(lat, lon, newWaypoints);
            }
        }
        zigZag = !zigZag;
    }

    // Mevcut rotayı sil ve yeni ızgarayı ata
    waypoints = newWaypoints;
    
    // Görselleri ve UI'ı güncelle
    renderVisuals(-1);
    updateUI();
    calculateLogistics();
}

// Yardımcı Fonksiyon: Izgara noktalarını koordinata çevir
function addGridPoint(lat, lon, array) {
    const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, 100); // 100m sabit yükseklik
    array.push({
        lat: lat,
        lon: lon,
        alt: 100,
        cartesian: cartesian
    });
}
