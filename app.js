// 1. Cesium ION Access Token (Harita verileri için zorunlu)
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzMzEyYzc1OS03OTY0LTQ5MGYtODcwMi0zMGNiYmZjNGIxMTkiLCJpZCI6Mzc2MTk2LCJpYXQiOjE3Njc4NjA4NjJ9.aZRZorILCG4gIlzwCnm1L2SCp58z-TCg6yNaDbPLxnU';

let viewer;
let waypoints = [];
let routeLineEntity = null;
let waypointEntities = [];








function initCesium() {
    viewer = new Cesium.Viewer('cesiumContainer', {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        baseLayerPicker: true,
        animation: false,
        timeline: false,
        infoBox: false,
        selectionIndicator: false,
        geocoder: true // Üst sağa dünya çapında arama kutusu ekler
    });

    // Sadece izin varsa ve konum alınabiliyorsa git, yoksa sessizce kal
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(lon, lat, 5000),
                    duration: 3
                });
            },
            (error) => {
                console.log("Auto-location skipped: User choice or secure connection required.");
                // Bir yere odaklanma, harita global kalsın
            }
        );
    }

    setupHandler();
}












// 3. Tıklama Olaylarını Yönet
function setupHandler() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
        const pickedPosition = viewer.scene.pickPosition(click.position);
        if (Cesium.defined(pickedPosition)) {
            const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const alt = Math.round(cartographic.height + 50);

            waypoints.push({
                lat: lat,
                lon: lon,
                alt: alt,
                cartesian: pickedPosition
            });

            renderVisuals(-1);
            updateUI();
            calculateLogistics();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// 4. Dinamik Menü Oluşturucu
function buildDynamicMenu() {
    const selected = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[selected];
    const container = document.getElementById('dynamic-inputs-container');
    
    container.innerHTML = ""; 

    config.inputs.forEach(input => {
        const div = document.createElement('div');
        div.className = 'input-group';
        div.innerHTML = `
            <label>${input.label}</label>
            <input type="number" id="${input.id}" value="${input.value}" onchange="calculateLogistics()">
        `;
        container.appendChild(div);
    });

    calculateLogistics();
}

// 5. Lojistik Hesaplama Motoru
function calculateLogistics() {
    if (waypoints.length < 1) return;

    const vehicleId = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[vehicleId];
    const alertBox = document.getElementById('energy-alert');
    const headwind = parseFloat(document.getElementById('uav-wind').value || 0);
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
    let accumulatedTime = 0;

    for (let i = 1; i < waypoints.length; i++) {
        const distMeters = Cesium.Cartesian3.distance(waypoints[i-1].cartesian, waypoints[i].cartesian);
        const effectiveSpeed = groundSpeed - headwind;
        let legTime, consumption;

        if (config.isElectric) {
            legTime = distMeters / (effectiveSpeed > 0 ? effectiveSpeed : 1);
            const weight = getVal('drone-weight');
            consumption = (weight * distMeters * 0.0008) + (legTime / 60 * 5);
        } else {
            const distNM = distMeters * 0.000539957;
            legTime = distNM / (effectiveSpeed > 0 ? effectiveSpeed : 1);
            consumption = hourlyRate * legTime;
        }

        accumulatedTime += legTime;
        currentEnergy -= consumption;
        if (currentEnergy <= 0 && failPointIndex === -1) failPointIndex = i;
    }

    if (failPointIndex !== -1) {
        alertBox.style.display = "block";
        alertBox.innerText = `⚠️ ${config.isElectric ? 'BATARYA' : 'YAKIT'} KRİTİK: WP #${failPointIndex + 1}`;
    } else {
        alertBox.style.display = "none";
    }

    renderVisuals(failPointIndex);
    updateStatsUI(config.isElectric, accumulatedTime, groundSpeed);
}








// 6. Görselleştirme (Derinlik Hatası Düzeltildi)
function renderVisuals(failIndex) {
    if (routeLineEntity) viewer.entities.remove(routeLineEntity);
    waypointEntities.forEach(e => viewer.entities.remove(e));
    waypointEntities = [];

    const positions = waypoints.map(wp => wp.cartesian);

    if (positions.length > 1) {
        routeLineEntity = viewer.entities.add({
            polyline: {
                positions: positions,
                width: 4,
                material: Cesium.Color.fromCssColorString('#38bdf8'),
                clampToGround: true, // Çizgiyi araziye yapıştırır
                classificationType: Cesium.ClassificationType.TERRAIN
            }
        });
    }

    waypoints.forEach((wp, index) => {
        const pin = viewer.entities.add({
            position: wp.cartesian,
            point: {
                pixelSize: 10,
                color: (failIndex !== -1 && index >= failIndex) ? Cesium.Color.RED : Cesium.Color.fromCssColorString('#10b981'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND // Noktayı yüzeye sabitler
            }
        });
        waypointEntities.push(pin);
    });
}

// 7. Profesyonel Nav Log Tablosu
function updateUI() {
    const list = document.getElementById('wp-list');
    const vehicleId = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[vehicleId];
    
    if (waypoints.length < 1) {
        list.innerHTML = "<p style='color:#64748b'>Rota noktası seçilmedi.</p>";
        return;
    }

    let tableHTML = `
        <table class="nav-log-table">
            <thead>
                <tr>
                    <th>BACAK</th>
                    <th>MESAFE</th>
                    <th>SÜRE</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 1; i < waypoints.length; i++) {
        const d = Cesium.Cartesian3.distance(waypoints[i-1].cartesian, waypoints[i].cartesian);
        
        // Birim Dönüşümü
        let distDisplay, timeDisplay;
        const speed = parseFloat(document.querySelector('[id*="speed"]').value || 1);

        if (config.unitSystem === "metric") {
            distDisplay = `${(d/1000).toFixed(2)} km`;
            timeDisplay = `${(d / speed / 60).toFixed(1)} dk`;
        } else {
            const distNM = d * 0.000539957;
            distDisplay = `${distNM.toFixed(1)} NM`;
            timeDisplay = `${(distNM / speed * 60).toFixed(1)} dk`;
        }

        tableHTML += `
            <tr>
                <td>WP${i}➔${i+1}</td>
                <td>${distDisplay}</td>
                <td>${timeDisplay}</td>
            </tr>
        `;
    }

    tableHTML += `</tbody></table>`;
    list.innerHTML = tableHTML;
}














function updateStatsUI(isElectric, accumulatedTime, groundSpeed) {
    const distText = isElectric ? `${((accumulatedTime * groundSpeed) / 1000).toFixed(2)} km` : `${(accumulatedTime * groundSpeed).toFixed(1)} NM`;
    const timeText = `${(accumulatedTime * 60).toFixed(1)} dk`;
    document.getElementById('total-stats').innerText = `Mesafe: ${distText} | Süre: ${timeText}`;
}





// 9. Arama Izgarası Oluşturma (Search Grid)
function generateSearchGrid() {
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

    const step = 0.0005; 
    const newWaypoints = [];
    let zigZag = true;

    for (let lat = latMin; lat <= latMax; lat += step) {
        if (zigZag) {
            for (let lon = lonMin; lon <= lonMax; lon += step) { addGridPoint(lat, lon, newWaypoints); }
        } else {
            for (let lon = lonMax; lon >= lonMin; lon -= step) { addGridPoint(lat, lon, newWaypoints); }
        }
        zigZag = !zigZag;
    }
    waypoints = newWaypoints;
    renderVisuals(-1);
    updateUI();
    calculateLogistics();
}

function addGridPoint(lat, lon, array) {
    const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, 100);
    array.push({ lat: lat, lon: lon, alt: 100, cartesian: cartesian });
}













// 10. Görev Verisini Dışa Aktarma (Export)
function exportMission(type) {
    if (waypoints.length === 0) {
        alert("Dışa aktarılacak rota bulunamadı!");
        return;
    }

    let content = "";
    let fileName = `NaviVortex_Mission_${type}`;

    if (type === 'LITCHI') {
        content = "latitude,longitude,altitude(m),heading(deg),curvesize(m),rotationdir,poi_latitude,poi_longitude,poi_altitude(m),poi_headingmode\n";
        waypoints.forEach(wp => {
            content += `${wp.lat},${wp.lon},${wp.alt},0,0,0,0,0,0,0\n`;
        });
        fileName += ".csv";
    }

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}












// 8. Başlatıcı
window.onload = () => {
    initCesium();
    buildDynamicMenu();
};
