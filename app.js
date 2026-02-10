// 1. Cesium ION Access Token (Harita verileri için zorunlu)
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzMzEyYzc1OS03OTY0LTQ5MGYtODcwMi0zMGNiYmZjNGIxMTkiLCJpZCI6Mzc2MTk2LCJpYXQiOjE3Njc4NjA4NjJ9.aZRZorILCG4gIlzwCnm1L2SCp58z-TCg6yNaDbPLxnU';




// --- FIREBASE CONFIGURATION (START) ---
const firebaseConfig = {
    apiKey: "AIzaSyDj58VpffB4SayaOZ6iA2JSfrFUhw0hzPw",
    authDomain: "navivortex-533de.firebaseapp.com",
    projectId: "navivortex-533de",
    storageBucket: "navivortex-533de.firebasestorage.app",
    messagingSenderId: "887483850322",
    appId: "1:887483850322:web:5c7ba61cbf0e52cc724988"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// 1. Google ile Giriş Yap
function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            console.log("Giriş Başarılı:", result.user.displayName);
        })
        .catch((error) => {
            alert("Giriş Hatası: " + error.message);
        });
}

// 2. Çıkış Yap
function logout() {
    auth.signOut().then(() => {
        console.log("Çıkış Yapıldı");
    });
}

// 3. Kullanıcı Durumunu Dinle (Oturum Açık mı?)
auth.onAuthStateChanged((user) => {
    const loginBtn = document.getElementById('btn-login');
    const userPanel = document.getElementById('user-panel');
    const userName = document.getElementById('user-name');

    if (user) {
        currentUser = user;
        loginBtn.style.display = 'none';
        userPanel.style.display = 'block';
        userName.innerText = `Pilot: ${user.displayName}`;
    } else {
        currentUser = null;
        loginBtn.style.display = 'block';
        userPanel.style.display = 'none';
    }
});

// 4. Rotayı Buluta Kaydet
function saveMissionToCloud() {
    if (!currentUser) {
        alert("Lütfen önce giriş yapın!");
        return;
    }
    if (waypoints.length < 2) {
        alert("Kaydedilecek rota yok! En az 2 nokta belirleyin.");
        return;
    }

    const missionData = {
        pilotId: currentUser.uid,
        pilotName: currentUser.displayName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        vehicle: document.getElementById('vehicle-category').value,
        points: waypoints.map(wp => ({
            lat: wp.lat,
            lon: wp.lon,
            alt: wp.alt
        }))
    };

    db.collection("missions").add(missionData)
        .then(() => {
            alert("✅ Mission saved successfully to Cloud!");
        })
        .catch((error) => {
            alert("❌ Save failed: " + error.message);
        });
}
// --- FIREBASE CONFIGURATION (END) ---








let viewer;
let waypoints = [];
let routeLineEntity = null;
let waypointEntities = [];








// 2. Initialize Map (Updated for Screenshot Capability)
function initCesium() {
    viewer = new Cesium.Viewer('cesiumContainer', {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        baseLayerPicker: true,
        animation: false,
        timeline: false,
        infoBox: false,
        selectionIndicator: false,
        geocoder: true,
        // BU KISIM YENİ VE ÇOK ÖNEMLİ (PDF İçin):
        contextOptions: {
            webgl: { preserveDrawingBuffer: true }
        }
    });

    // Otomatik Konum (Önceki kodun aynısı)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(pos.coords.longitude, pos.coords.latitude, 5000)
                });
            },
            (err) => console.log("Location access denied.")
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
                clampToGround: true, 
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
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND 
            }
        });
        waypointEntities.push(pin);
    });
}

// 7. Profesyonel Nav Log Tablosu
// 7. Professional Nav Log Table (English Interface)
function updateUI() {
    const list = document.getElementById('wp-list');
    const vehicleId = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[vehicleId];
    
    // Check if enough waypoints exist
    if (waypoints.length < 2) {
        list.innerHTML = "<p style='color:#94a3b8; font-size:11px; padding:10px; text-align:center;'>Select at least 2 points on the map to view Mission Analysis.</p>";
        return;
    }

    // Table Header in English
    let tableHTML = `
        <table class="nav-log-table">
            <thead>
                <tr>
                    <th>LEG</th>
                    <th>DIST</th>
                    <th>ETE</th>
                    <th>BURN</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 1; i < waypoints.length; i++) {
        const d = Cesium.Cartesian3.distance(waypoints[i-1].cartesian, waypoints[i].cartesian);
        
        // Get speed and consumption rate inputs safely
        const speedInputId = config.isElectric ? 'drone-speed' : 'fuel-speed';
        const rateInputId = config.isElectric ? 'drone-bat' : 'fuel-rate'; // Note: simplified logic for drone burn
        
        const speed = parseFloat(document.getElementById(speedInputId)?.value || 1);
        
        // Calculate Logic based on Unit System
        let distDisplay, timeDisplay, burnDisplay;

        if (config.unitSystem === "metric") {
            // Metric Calculations (Drone)
            const distKm = d / 1000;
            const timeMin = (d / speed) / 60;
            
            // Simple Drone Burn Model: (Time based estimate + Distance factor)
            // This is a placeholder logic. You can refine this formula later.
            const burn = (timeMin * 50) + (distKm * 10); 
            
            distDisplay = `${distKm.toFixed(2)} km`;
            timeDisplay = `${timeMin.toFixed(1)} min`;
            burnDisplay = `~${burn.toFixed(0)} mAh`;
        } else {
            // Aviation Calculations (Aircraft)
            const distNM = d * 0.000539957; // Convert Meters to Nautical Miles
            const timeHrs = distNM / speed;
            const flowRate = parseFloat(document.getElementById('fuel-rate')?.value || 0);
            const burn = timeHrs * flowRate;
            
            distDisplay = `${distNM.toFixed(1)} NM`;
            timeDisplay = `${(timeHrs * 60).toFixed(1)} min`;
            burnDisplay = `${burn.toFixed(1)} L`;
        }

        // Add Row to Table
        tableHTML += `
            <tr>
                <td style="color:#fff; font-weight:bold;">WP${i}➔${i+1}</td>
                <td>${distDisplay}</td>
                <td>${timeDisplay}</td>
                <td>${burnDisplay}</td>
            </tr>
        `;
    }

    tableHTML += `</tbody></table>`;
    
    // Add a summary footer
    tableHTML += `<div style="margin-top:10px; border-top:1px solid #334155; padding-top:5px; font-size:10px; color:#94a3b8; text-align:right;">*ETE: Estimated Time Enroute</div>`;
    
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











// 11. Generate Professional Mission Briefing (PDF)
function generateMissionBriefing() {
    if (waypoints.length < 2) {
        alert("Please define a route with at least 2 points first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const vehicleId = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[vehicleId];
    const date = new Date().toLocaleString();

    // 1. Header & Title
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text("MISSION BRIEFING REPORT", 105, 20, null, null, "center");
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated by NaviVortex V60 | Date: ${date}`, 105, 28, null, null, "center");

    doc.setLineWidth(0.5);
    doc.line(20, 32, 190, 32);

    // 2. Mission Parameters
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Vehicle Profile: ${vehicleId.toUpperCase().replace('_', ' ')}`, 20, 42);
    doc.text(`Unit System: ${config.unitSystem.toUpperCase()}`, 20, 48);

    // 3. Map Screenshot (Capture current view)
    // Haritanın anlık görüntüsünü al
    const canvas = viewer.scene.canvas;
    const imgData = canvas.toDataURL("image/jpeg", 0.7);
    doc.addImage(imgData, 'JPEG', 20, 55, 170, 80); // x, y, width, height

    // 4. Navigation Log Table
    const tableRows = [];
    let totalDist = 0;
    
    waypoints.forEach((wp, i) => {
        if (i === 0) return; // Skip first point for "legs"

        const prev = waypoints[i-1];
        const dist = Cesium.Cartesian3.distance(prev.cartesian, wp.cartesian);
        const speedInputId = config.isElectric ? 'drone-speed' : 'fuel-speed';
        const speed = parseFloat(document.getElementById(speedInputId)?.value || 1);

        let distTxt, timeTxt;

        if (config.unitSystem === "metric") {
            distTxt = (dist / 1000).toFixed(2) + " km";
            timeTxt = ((dist / speed) / 60).toFixed(1) + " min";
        } else {
            const nm = dist * 0.000539957;
            distTxt = nm.toFixed(1) + " NM";
            timeTxt = (nm / speed * 60).toFixed(1) + " min";
        }

        tableRows.push([
            `WP ${i} -> WP ${i+1}`,
            `${prev.lat.toFixed(4)}, ${prev.lon.toFixed(4)}`, // From
            distTxt,
            timeTxt,
            "___" // Checkbox column for pilot
        ]);
    });

    doc.autoTable({
        startY: 140,
        head: [['Leg', 'From Coordinates', 'Distance', 'ETE', 'Check']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [22, 163, 74] }, // Green header
        styles: { fontSize: 10 }
    });

    // 5. Signature Section
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.text("Pilot in Command Signature:", 20, finalY);
    doc.line(20, finalY + 10, 80, finalY + 10);

    doc.text("Weather / NOTAM Notes:", 110, finalY);
    doc.line(110, finalY + 10, 190, finalY + 10);
    doc.line(110, finalY + 20, 190, finalY + 20);

    // Save
    doc.save(`NaviVortex_Mission_${date.replace(/[: ]/g, '_')}.pdf`);
}











// 8. Başlatıcı
window.onload = () => {
    initCesium();
    buildDynamicMenu();
};
