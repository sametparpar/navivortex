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














// 3. Dynamic Vehicle Inputs (Araç Tipine Göre Inputları Değiştir)
function updateVehicleParams() {
    const category = document.getElementById('vehicle-category').value;
    const container = document.getElementById('dynamic-inputs');
    let html = '';

    if (category === 'electric_drone') {
        // --- DRONE AYARLARI ---
        html = `
            <div class="input-group" style="margin-top:10px;">
                <label style="color:#94a3b8; font-size:10px;">CRUISE SPEED (m/s)</label>
                <input type="number" id="drone-speed" value="15" oninput="updateUI()" style="background:#0f172a; border:1px solid #334155; color:white; width:100%; padding:5px; border-radius:4px;">
            </div>
            <div class="input-group" style="margin-top:5px;">
                <label style="color:#94a3b8; font-size:10px;">BATTERY CAPACITY (mAh)</label>
                <input type="number" id="drone-bat" value="5200" oninput="updateUI()" style="background:#0f172a; border:1px solid #334155; color:white; width:100%; padding:5px; border-radius:4px;">
            </div>
        `;
    } else {
        // --- UÇAK (C172) AYARLARI ---
        html = `
            <div class="input-group" style="margin-top:10px;">
                <label style="color:#94a3b8; font-size:10px;">TRUE AIRSPEED (TAS - kts)</label>
                <input type="number" id="fuel-speed" value="110" oninput="updateUI()" style="background:#0f172a; border:1px solid #334155; color:white; width:100%; padding:5px; border-radius:4px;">
            </div>
            <div class="input-group" style="margin-top:5px;">
                <label style="color:#94a3b8; font-size:10px;">FUEL BURN (Gal/hr)</label>
                <input type="number" id="fuel-rate" value="9" oninput="updateUI()" style="background:#0f172a; border:1px solid #334155; color:white; width:100%; padding:5px; border-radius:4px;">
            </div>
        `;
    }

    // HTML'i içeri bas
    container.innerHTML = html;
    
    // Değerler değiştiği için hesaplamayı hemen güncelle
    updateUI();
}





















// 7. Professional Nav Log Table (With Wind Triangle Physics 🌪️)
function updateUI() {
    const list = document.getElementById('wp-list');
    const vehicleId = document.getElementById('vehicle-category').value;
    const config = VEHICLE_CONFIGS[vehicleId];
    
    // Rüzgar Verilerini Al
    const windDir = parseFloat(document.getElementById('wind-direction').value || 0);
    const windSpd = parseFloat(document.getElementById('wind-speed').value || 0);

    if (waypoints.length < 2) {
        list.innerHTML = "<p style='color:#94a3b8; font-size:11px; padding:10px; text-align:center;'>Select at least 2 points to calculate Wind Triangle.</p>";
        return;
    }

    let tableHTML = `
        <table class="nav-log-table">
            <thead>
                <tr>
                    <th>LEG</th>
                    <th>CRS</th>
                    <th>HDG</th>
                    <th>GS</th>
                    <th>ETE</th>
                    <th>BURN</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 1; i < waypoints.length; i++) {
        const prev = waypoints[i-1];
        const curr = waypoints[i];
        
        // 1. Temel Mesafe (Distance)
        const d = Cesium.Cartesian3.distance(prev.cartesian, curr.cartesian);
        
        // 2. True Course (TC) Hesabı (İki nokta arasındaki açı)
        // Cesium'dan yeryüzü açısını (bearing) alıyoruz
        const vector = Cesium.Cartesian3.subtract(curr.cartesian, prev.cartesian, new Cesium.Cartesian3());
        const east = Cesium.Cartesian3.cross(prev.cartesian, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
        const north = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, east, new Cesium.Cartesian3());
        
        // Basitleştirilmiş Yön Hesabı (Lat/Lon farkından)
        const y = Math.sin(curr.lon * Math.PI/180 - prev.lon * Math.PI/180) * Math.cos(curr.lat * Math.PI/180);
        const x = Math.cos(prev.lat * Math.PI/180) * Math.sin(curr.lat * Math.PI/180) -
                  Math.sin(prev.lat * Math.PI/180) * Math.cos(curr.lat * Math.PI/180) * Math.cos(curr.lon * Math.PI/180 - prev.lon * Math.PI/180);
        let tc = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; // True Course (Derece)

        // 3. Hız ve Rüzgar Vektörleri
        const speedInputId = config.isElectric ? 'drone-speed' : 'fuel-speed';
        let tas = parseFloat(document.getElementById(speedInputId)?.value || 1); // True Air Speed
        
        // Birim Dönüşümü (Hesaplamalar Knot/Saat veya m/s üzerinden yapılır)
        // Eğer Drone ise (m/s), Rüzgar da m/s kabul edilir.
        // Eğer Uçak ise (kts), Rüzgar da kts kabul edilir.

        // 4. Rüzgar Üçgeni (The Wind Triangle) 📐
        // WCA = asin( (WindSpeed * sin(WindDir - TC)) / TAS )
        const rad = Math.PI / 180;
        const wcaRad = Math.asin((windSpd * Math.sin((windDir - tc) * rad)) / tas);
        const wca = wcaRad * 180 / Math.PI;
        
        // Ground Speed (GS) = TAS * cos(WCA) + WindSpeed * cos(WindDir - TC)
        // Basitleştirilmiş Vektör Hesabı:
        let gs = tas * Math.cos(wcaRad) + windSpd * Math.cos((windDir - tc) * rad);
        
        // Heading (Baş) = Course + WCA (Rüzgar düzeltmesi eklenir)
        let hdg = tc + wca;
        if (isNaN(hdg)) hdg = tc; // Rüzgar hızı uçak hızından büyükse matematik hata verir
        if (isNaN(gs)) gs = tas;

        // 5. Sonuçları Formatla
        let distDisplay, timeDisplay, burnDisplay, gsDisplay;
        const rate = parseFloat(document.getElementById(config.isElectric ? 'drone-bat' : 'fuel-rate')?.value || 0);

        if (config.unitSystem === "metric") {
            const distKm = d / 1000;
            const timeMin = (distKm * 1000) / gs / 60; // gs is m/s
            const burn = timeMin * 50; // Basit drone formülü
            
            distDisplay = `${distKm.toFixed(1)}km`;
            gsDisplay = `${gs.toFixed(0)}m/s`;
            timeDisplay = `${timeMin.toFixed(1)}m`;
            burnDisplay = `~${burn.toFixed(0)}`;
        } else {
            const distNM = d * 0.000539957;
            const timeHrs = distNM / gs; // gs is knots
            const burn = timeHrs * rate;

            distDisplay = `${distNM.toFixed(1)}NM`;
            gsDisplay = `${gs.toFixed(0)}kts`;
            timeDisplay = `${(timeHrs * 60).toFixed(0)}m`;
            burnDisplay = `${burn.toFixed(1)}L`;
        }

        tableHTML += `
            <tr>
                <td style="color:#fff;">WP${i}➔${i+1}</td>
                <td>${tc.toFixed(0)}°</td>
                <td style="color:#f59e0b; font-weight:bold;">${hdg.toFixed(0)}°</td>
                <td>${gsDisplay}</td>
                <td>${timeDisplay}</td>
                <td>${burnDisplay}</td>
            </tr>
        `;
    }

    tableHTML += `</tbody></table>`;
    
    // Footer: Rüzgar Bilgisi
    if (windSpd > 0) {
        tableHTML += `<div style="margin-top:5px; font-size:9px; color:#f59e0b; text-align:right;">
            ⚠️ Wind Correction Applied: ${windDir}° @ ${windSpd}
        </div>`;
    }
    
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















// 12. Load Missions from Cloud (My Missions Panel)
function loadMyMissions() {
    if (!currentUser) {
        alert("Please sign in to view your saved missions.");
        return;
    }

    const container = document.getElementById('mission-list-container');
    
    // Toggle Visibility (Aç/Kapa)
    if (container.style.display === 'none') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = '<p style="padding:10px; color:#94a3b8; font-size:10px; text-align:center;">Loading...</p>';

    // Firebase Query
    db.collection("missions")
        .where("pilotId", "==", currentUser.uid)
        .orderBy("createdAt", "desc")
        .limit(10) // Son 10 görevi getir
        .get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                container.innerHTML = '<p style="padding:10px; color:#94a3b8; font-size:10px; text-align:center;">No saved missions found.</p>';
                return;
            }

            let html = '';
            querySnapshot.forEach((doc) => {
                const mission = doc.data();
                const date = mission.createdAt ? new Date(mission.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
                
                // Güvenli veri kontrolü
                const vehicleName = mission.vehicle ? mission.vehicle.toUpperCase().replace('_', ' ') : 'UNKNOWN';
                const pointCount = mission.points ? mission.points.length : 0;

                html += `
                    <div class="mission-item" onclick="restoreMission('${doc.id}')">
                        <div class="mission-info">
                            <strong>${vehicleName}</strong> (${pointCount} WPs)
                            <span class="mission-date">${date}</span>
                        </div>
                        <button class="mission-delete-btn" onclick="deleteMission(event, '${doc.id}')" title="Delete">×</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        })
        .catch((error) => {
            console.error("Error loading missions:", error);
            container.innerHTML = '<p style="padding:10px; color:#ef4444; font-size:10px; text-align:center;">Error loading data.</p>';
        });
}

// 13. Restore Mission to Map (Haritayı Yeniden Çiz)
function restoreMission(missionId) {
    db.collection("missions").doc(missionId).get().then((doc) => {
        if (doc.exists) {
            const mission = doc.data();
            
            // 1. Araç Tipini Ayarla
            const vehicleSelect = document.getElementById('vehicle-category');
            if (vehicleSelect && mission.vehicle) {
                vehicleSelect.value = mission.vehicle;
                buildDynamicMenu(); // Inputları güncelle
            }

            // 2. Noktaları Temizle ve Geri Yükle
            waypoints = [];
            
            mission.points.forEach(pt => {
                const cartesian = Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, pt.alt);
                waypoints.push({
                    lat: pt.lat,
                    lon: pt.lon,
                    alt: pt.alt,
                    cartesian: cartesian
                });
            });

            // 3. Haritayı ve Tabloyu Güncelle
            renderVisuals(-1);
            updateUI();
            
            // 4. Kamerayı Rotaya Odakla
            if (waypoints.length > 0) {
                const firstWP = waypoints[0];
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(firstWP.lon, firstWP.lat, 2000),
                    duration: 2
                });
            }

            // Listeyi Gizle
            document.getElementById('mission-list-container').style.display = 'none';
            console.log("Mission restored:", missionId);
        }
    }).catch((error) => {
        console.error("Error restoring mission:", error);
    });
}

// 14. Delete Mission (Silme İşlemi)
function deleteMission(event, missionId) {
    event.stopPropagation(); // Listeye tıklamayı engelle (Sadece sil)
    if (confirm("Are you sure you want to delete this mission?")) {
        db.collection("missions").doc(missionId).delete().then(() => {
            loadMyMissions(); // Listeyi yenile
        }).catch((error) => {
            alert("Error deleting mission: " + error.message);
        });
    }
}


















// 15. UI Interaction (Accordion Menu)
function toggleMenu(sectionId) {
    const section = document.getElementById(sectionId);
    const allSections = document.querySelectorAll('.menu-content');
    
    // İsteğe bağlı: Diğerlerini kapat, sadece tıklananı aç (Daha temiz görünüm için)
    // allSections.forEach(div => {
    //    if(div.id !== sectionId) div.style.display = 'none';
    // });

    if (section.style.display === 'none' || section.style.display === '') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

// 16. Live Weather Fetch (OpenWeatherMap API)
async function getLiveWeather() {
    // ⚠️ DİKKAT: Buraya kendi API anahtarını alıp yazmalısın.
    // Ücretsiz almak için: https://home.openweathermap.org/users/sign_up
    const API_KEY = "86b7d3ff9069982fcbdca23d170f0a70"; 
    
    if (waypoints.length === 0) {
        alert("Please place at least one point on the map to get local weather.");
        return;
    }

    // İlk noktanın konumunu al
    const lat = waypoints[0].lat;
    const lon = waypoints[0].lon;
    const btn = document.querySelector('button[onclick="getLiveWeather()"]');

    btn.innerText = "⏳ Loading...";

    try {
        // Eğer API Key yoksa (Demo Modu) - Kullanıcıyı üzmemek için rastgele veri
        if (API_KEY === "BURAYA_KENDI_API_ANAHTARINI_YAZMALISIN") {
            console.warn("API Key eksik. Demo verisi gösteriliyor.");
            setTimeout(() => {
                alert("⚠️ API Key not found! Showing DEMO weather data.\n(Edit app.js line ~400 to add your OpenWeatherMap Key)");
                document.getElementById('wind-direction').value = Math.floor(Math.random() * 360);
                document.getElementById('wind-speed').value = Math.floor(Math.random() * 20) + 5;
                updateUI();
                btn.innerText = "☁️ GET LIVE";
            }, 1000);
            return;
        }

        // Gerçek API Çağrısı
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
        const data = await response.json();

        if (data.wind) {
            // Açıyı ve hızı kutulara yaz
            document.getElementById('wind-direction').value = data.wind.deg;
            
            // API m/s verir. Eğer uçak seçiliyse (knot) dönüştür.
            const vehicleId = document.getElementById('vehicle-category').value;
            const config = VEHICLE_CONFIGS[vehicleId];
            
            let speedVal = data.wind.speed; // m/s
            if (!config.isElectric) { // Uçaksa (Aviation mode)
                speedVal = speedVal * 1.94384; // m/s to knots
            }
            
            document.getElementById('wind-speed').value = speedVal.toFixed(1);
            
            updateUI(); // Haritadaki vektörleri güncelle
            alert(`✅ Weather Updated for ${data.name}:\nWind: ${data.wind.deg}° at ${speedVal.toFixed(1)} ${config.isElectric ? 'm/s' : 'kts'}`);
        }
    } catch (error) {
        console.error(error);
        alert("Weather fetch failed. Check console.");
    } finally {
        btn.innerText = "☁️ GET LIVE";
    }
}














                          










// 8. Başlatıcı
window.onload = () => {
    initCesium();
    buildDynamicMenu();
};





// Sayfa yüklendiğinde varsayılan araç ayarlarını getir:
updateVehicleParams();
