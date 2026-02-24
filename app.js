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


















// ---------------------------------------------------------
// 25. SMART INTERACTION HANDLER (Insert Between Points) 🧠🖱️
// ---------------------------------------------------------
function setupHandler() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    let isDragging = false;
    let draggedEntity = null;
    let draggedIndex = -1;

    // 1. SÜRÜKLEME BAŞLAT
    handler.setInputAction(function(click) {
        const pickedObject = viewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id) {
            const index = waypointEntities.indexOf(pickedObject.id);
            if (index !== -1) {
                isDragging = true;
                draggedEntity = pickedObject.id;
                draggedIndex = index;
                viewer.scene.screenSpaceCameraController.enableRotate = false;
                document.body.style.cursor = "grabbing";
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    // 2. SÜRÜKLEME HAREKETİ
    handler.setInputAction(function(movement) {
        if (isDragging && draggedEntity && draggedIndex !== -1) {
            const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
            if (cartesian) {
                draggedEntity.position = new Cesium.ConstantPositionProperty(cartesian);
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                
                waypoints[draggedIndex].lat = Cesium.Math.toDegrees(cartographic.latitude);
                waypoints[draggedIndex].lon = Cesium.Math.toDegrees(cartographic.longitude);
                waypoints[draggedIndex].cartesian = cartesian;
                
                updateUI();
                calculateLogistics();
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 3. SÜRÜKLEME BİTİR
    handler.setInputAction(function() {
        if (isDragging) {
            isDragging = false;
            draggedEntity = null;
            draggedIndex = -1;
            viewer.scene.screenSpaceCameraController.enableRotate = true;
            document.body.style.cursor = "default";
            
            // Son hesaplamalar (Grafik güncellemesi burada yapılır)
            if(typeof updateElevationProfile === 'function') updateElevationProfile();
            showToast("Route updated.", "info");
        }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // 4. AKILLI NOKTA EKLEME (INSERT LOGIC) 🧠
    handler.setInputAction((click) => {
        if (isDragging) return;
        const pickedObject = viewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id) return;

        const pickedPosition = viewer.scene.pickPosition(click.position);
        
        if (Cesium.defined(pickedPosition)) {
            const newCartesian = pickedPosition;
            const newCartographic = Cesium.Cartographic.fromCartesian(newCartesian);
            const newPoint = {
                lat: Cesium.Math.toDegrees(newCartographic.latitude),
                lon: Cesium.Math.toDegrees(newCartographic.longitude),
                alt: Math.round(newCartographic.height + 50),
                cartesian: newCartesian
            };

            // --- EN İYİ YERİ BULMA ALGORİTMASI ---
            let bestIndex = waypoints.length; // Varsayılan: Sona ekle
            let minDistance = Number.MAX_VALUE;

            // Her bir bacağa (Leg) olan mesafeyi kontrol et
            for (let i = 0; i < waypoints.length - 1; i++) {
                const p1 = waypoints[i].cartesian;
                const p2 = waypoints[i+1].cartesian;
                
                // Basit mesafe kontrolü: (A-C) + (C-B) mesafesi (A-B)'ye ne kadar yakın?
                const distA_New = Cesium.Cartesian3.distance(p1, newCartesian);
                const distNew_B = Cesium.Cartesian3.distance(newCartesian, p2);
                const distA_B = Cesium.Cartesian3.distance(p1, p2);
                
                // Eğer nokta çizginin üzerindeyse: (distA_New + distNew_B) == distA_B olur.
                // Biz %10'luk bir hata payı (tolerance) bırakalım.
                const detour = (distA_New + distNew_B) - distA_B;
                
                // Eğer bu sapma çok küçükse (örn: 10km'den azsa) ve en iyi adaysa
                // Not: 10000 değeri harita ölçeğine göre değişir ama genelde iyi çalışır.
                if (detour < minDistance && detour < 50000) { 
                    minDistance = detour;
                    bestIndex = i + 1; // Araya ekle
                }
            }

            // Noktayı en iyi yere ekle
            waypoints.splice(bestIndex, 0, newPoint);

            // Çiz
            renderVisuals(-1);
            updateUI();
            calculateLogistics();
            if(typeof updateElevationProfile === 'function') updateElevationProfile();
            
            showToast(bestIndex === waypoints.length ? "Point added to END." : "Point inserted inside ROUTE.", "success");
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













// 5. Logistics Engine (Advanced Vertical Physics) 📐⚡
function calculateLogistics() {
    if (waypoints.length < 1) return;

    const vehicleId = document.getElementById('vehicle-category').value;
    const isElectric = (vehicleId === 'electric_drone');
    const alertBox = document.getElementById('energy-alert');
    const headwind = parseFloat(document.getElementById('uav-wind').value || 0);
    const getVal = (id) => parseFloat(document.getElementById(id)?.value || 0);
    
    // --- 1. KAPASİTEYİ AL ---
    let totalCapacity = isElectric ? getVal('drone-bat') : getVal('fuel-cap');
    let currentEnergy = totalCapacity;
    
    let totalTimeMin = 0;
    let failPointIndex = -1;

    // --- 2. HER BACAK (LEG) İÇİN HESAPLA ---
    for (let i = 1; i < waypoints.length; i++) {
        const prev = waypoints[i-1];
        const curr = waypoints[i];
        
        // Mesafe (3D Distance - Hipotenüs)
        const distMeters = Cesium.Cartesian3.distance(prev.cartesian, curr.cartesian);
        
        // İrtifa Farkı (Tırmanıyor muyuz?)
        const altDiff = curr.alt - prev.alt; // Metre cinsinden fark (+ ise Tırmanış)
        
        // --- DRONE FİZİĞİ ---
        if (isElectric) {
            let speed = getVal('drone-speed'); // Varsayılan Cruise
            let burnRate = getVal('drone-burn-cruise'); // mAh/dk

            // Tırmanış Modu
            if (altDiff > 5) { 
                speed = getVal('drone-climb-speed');
                burnRate = getVal('drone-burn-climb');
            } 
            // Alçalış Modu
            else if (altDiff < -5) {
                // Hız aynı kalır veya artar (Şimdilik Cruise ile aynı tutuyoruz)
                burnRate = getVal('drone-burn-descent');
            }

            // Rüzgar Etkisi (Basit)
            const groundSpeed = Math.max(1, speed - headwind); 
            
            // Süre (Dakika)
            const legTimeMin = (distMeters / groundSpeed) / 60;
            
            // Tüketim (mAh) = Dakika * (mAh/dk)
            const consumption = legTimeMin * burnRate;
            
            currentEnergy -= consumption;
            totalTimeMin += legTimeMin;
        } 
        
        // --- UÇAK FİZİĞİ ---
        else {
            let speedKts = getVal('fuel-speed'); // Cruise TAS
            let burnGPH = getVal('fuel-rate');   // Cruise Flow

            // Tırmanış Modu
            if (altDiff > 10) { 
                speedKts = getVal('plane-climb-spd');
                burnGPH = getVal('plane-burn-climb');
            }
            // Alçalış Modu
            else if (altDiff < -10) {
                burnGPH = getVal('plane-burn-descent');
            }

            // Hız Dönüşümü (Knot -> m/s)
            // 1 Knot = 0.5144 m/s
            // Rüzgarı düşüyoruz
            const groundSpeedKts = Math.max(10, speedKts - headwind);
            
            // Mesafe (Deniz Mili)
            const distNM = distMeters * 0.000539957;
            
            // Süre (Saat)
            const legTimeHrs = distNM / groundSpeedKts;
            
            // Tüketim (Galon)
            const consumption = legTimeHrs * burnGPH;

            currentEnergy -= consumption;
            totalTimeMin += (legTimeHrs * 60);
        }

        // --- 3. KRİTİK SEVİYE KONTROLÜ ---
        if (currentEnergy <= 0 && failPointIndex === -1) {
            failPointIndex = i;
        }
    }

    // --- 4. SONUÇLARI GÖSTER ---
    if (failPointIndex !== -1) {
        alertBox.style.display = "block";
        alertBox.innerText = `⚠️ ${isElectric ? 'BATTERY' : 'FUEL'} DEPLETED AT WP #${failPointIndex + 1}`;
    } else {
        alertBox.style.display = "none";
    }

    // Toplamları Yazdır (Hız ortalama alınmaz, o yüzden cruise speed'i referans veriyoruz)
    // Ama süreyi doğru hesapladık.
    const avgSpeed = isElectric ? getVal('drone-speed') : (getVal('fuel-speed') * 0.5144);
    updateStatsUI(isElectric, totalTimeMin / 60, avgSpeed); // updateStatsUI saat/dk dönüşümünü kendi yapıyor olabilir, kontrol et.
    
    // updateStatsUI fonksiyonun dakika (min) değil saat (hour) bekliyorsa burayı düzeltmemiz gerekebilir.
    // Senin mevcut updateStatsUI kodun "accumulatedTime" alıyor.
    // Eğer önceki kodda 'accumulatedTime' DAKİKA ise sorun yok.
    // Düzeltme: updateStatsUI fonksiyonun yapısına uyumlu gönderiyoruz.
    // (Önceki kodda: Drone için dakika, Uçak için saatti. Standartlaştıralım)
}


















// ---------------------------------------------------------
// 26. GLOBAL ALTITUDE UPDATER (Safe & English) 📶
// ---------------------------------------------------------
function updateGlobalAltitude() {
    const vehicleId = document.getElementById('vehicle-category').value;
    const isElectric = (vehicleId === 'electric_drone');
    
    // Değeri al
    const inputId = isElectric ? 'drone-alt' : 'plane-alt';
    let newAltVal = parseFloat(document.getElementById(inputId).value);
    
    // HATA KORUMASI: Eğer kutu boşsa veya geçersizse işlem yapma!
    if (isNaN(newAltVal) || newAltVal === null) {
        console.warn("Invalid altitude input.");
        return;
    }

    // Birim Dönüşümü (Feet -> Metre)
    let altitudeMeters = isElectric ? newAltVal : (newAltVal * 0.3048);

    // Tüm noktaların yüksekliğini güncelle
    waypoints.forEach((wp) => {
        wp.alt = altitudeMeters;
        // Yeni yükseklik ile Cartesian koordinatı güncelle (Lat/Lon koruyarak)
        wp.cartesian = Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt);
    });

    // Her şeyi güncelle
    renderVisuals(-1);        
    updateUI();               
    calculateLogistics();     
    
    if(typeof updateElevationProfile === 'function') updateElevationProfile();
    
    showToast(`Altitude updated to ${newAltVal} ${isElectric ? 'm' : 'ft'}.`, "info");
}



























// 5. Render Visuals (Always Visible Points) 🎨
function renderVisuals(activeParamIndex) {
    viewer.entities.removeAll();
    waypointEntities = []; // Listeyi sıfırla

    // 1. Polygon (Area)
    if (waypoints.length >= 3) {
        viewer.entities.add({
            polygon: {
                hierarchy: new Cesium.CallbackProperty(() => {
                    return new Cesium.PolygonHierarchy(waypoints.map(p => p.cartesian));
                }, false),
                material: Cesium.Color.CYAN.withAlpha(0.2),
                outline: true,
                outlineColor: Cesium.Color.CYAN.withAlpha(0.5),
                outlineWidth: 2
            }
        });
    }

    // 2. Route Line
    if (waypoints.length > 0) {
        viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    return waypoints.map(p => p.cartesian);
                }, false),
                width: 3,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.YELLOW
                }),
                // Çizgi de yerin altında kalsa bile görünsün
                depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.RED.withAlpha(0.5) // Yerin altındaysa Kırmızılaşsın
                })
            }
        });
    }

    // 3. Waypoints (Points)
    waypoints.forEach((wp, index) => {
        const isSelected = (index === activeParamIndex);
        const color = isSelected ? Cesium.Color.RED : Cesium.Color.YELLOW;
        const scale = isSelected ? 10 : 6;

        const entity = viewer.entities.add({
            position: wp.cartesian,
            point: {
                pixelSize: scale,
                color: color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                // İŞTE SİHİRLİ KOD: Noktalar asla yerin altına girip kaybolmaz!
                disableDepthTestDistance: Number.POSITIVE_INFINITY 
            },
            label: {
                text: (index + 1).toString(),
                font: '10px sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -10),
                show: (waypoints.length < 20),
                disableDepthTestDistance: Number.POSITIVE_INFINITY // Yazılar da kaybolmasın
            }
        });

        waypointEntities.push(entity);
    });
}



















// --- 🚀 FAZ 1: HAZIR ARAÇ PROFİLLERİ (DATABASE) ---
const VEHICLE_PRESETS = {
    // Dronelar
    "custom_drone": { cruise: 15, climb: 5, bat: 5000, burn_climb: 300, burn_cruise: 150, burn_descent: 50, alt: 120 },
    "mavic3e": { cruise: 15, climb: 6, bat: 5000, burn_climb: 250, burn_cruise: 110, burn_descent: 40, alt: 100 },
    "phantom4rtk": { cruise: 10, climb: 5, bat: 5870, burn_climb: 320, burn_cruise: 195, burn_descent: 60, alt: 100 },
    "matrice300": { cruise: 15, climb: 5, bat: 15000, burn_climb: 500, burn_cruise: 340, burn_descent: 100, alt: 120 },
    
    // Uçaklar
    "custom_aircraft": { cruise: 110, climb_spd: 75, alt: 3500, cap: 50, burn_climb: 13, burn_cruise: 9, burn_descent: 5 },
    "c172": { cruise: 110, climb_spd: 75, alt: 3500, cap: 53, burn_climb: 14, burn_cruise: 8.5, burn_descent: 5 },
    "pa28": { cruise: 120, climb_spd: 80, alt: 4500, cap: 50, burn_climb: 15, burn_cruise: 10, burn_descent: 6 },
    "da40": { cruise: 135, climb_spd: 80, alt: 5500, cap: 40, burn_climb: 12, burn_cruise: 9, burn_descent: 4 }
};

function applyVehiclePreset() {
    const presetId = document.getElementById('vehicle-preset-select').value;
    if (!presetId || !VEHICLE_PRESETS[presetId]) return;
    const p = VEHICLE_PRESETS[presetId];
    const category = document.getElementById('vehicle-category').value;

    // Kutuları otomatik doldur
    if (category === 'electric_drone') {
        document.getElementById('drone-alt').value = p.alt;
        document.getElementById('drone-speed').value = p.cruise;
        document.getElementById('drone-climb-speed').value = p.climb;
        document.getElementById('drone-bat').value = p.bat;
        document.getElementById('drone-burn-climb').value = p.burn_climb;
        document.getElementById('drone-burn-cruise').value = p.burn_cruise;
        document.getElementById('drone-burn-descent').value = p.burn_descent;
    } else {
        document.getElementById('plane-alt').value = p.alt;
        document.getElementById('plane-climb-spd').value = p.climb_spd;
        document.getElementById('fuel-speed').value = p.cruise;
        document.getElementById('fuel-cap').value = p.cap;
        document.getElementById('plane-burn-climb').value = p.burn_climb;
        document.getElementById('fuel-rate').value = p.burn_cruise;
        document.getElementById('plane-burn-descent').value = p.burn_descent;
    }
    
    // Yeni değerlere göre rotayı ve yakıtı tekrar hesapla
    updateGlobalAltitude(); 
    calculateLogistics(); 
    showToast("Profile Loaded: " + document.getElementById('vehicle-preset-select').options[document.getElementById('vehicle-preset-select').selectedIndex].text, "success");
}

// 3. Dynamic Vehicle Inputs (Advanced Physics V2) ✈️
function updateVehicleParams() {
    const category = document.getElementById('vehicle-category').value;
    const container = document.getElementById('dynamic-inputs');
    let html = '';

    if (category === 'electric_drone') {
        // --- DRONE (DJI MATRICE / MAVIC TARZI) ---
        html = `
            <div class="input-group" style="margin-bottom: 15px; background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 4px; border: 1px solid #10b981;">
                <label style="color:#10b981;">🚀 QUICK LOAD PROFILE</label>
                <select id="vehicle-preset-select" onchange="applyVehiclePreset()" style="width:100%; padding:5px; background:#1e293b; color:white; border:1px solid #334155; border-radius:4px; margin-top:5px; outline:none;">
                    <option value="custom_drone" selected>Custom Drone (Manual)</option>
                    <option value="mavic3e">DJI Mavic 3 Enterprise</option>
                    <option value="phantom4rtk">DJI Phantom 4 RTK</option>
                    <option value="matrice300">DJI Matrice 300 RTK</option>
                </select>
            </div>
            <div style="border-bottom:1px dashed #334155; margin-bottom:10px; padding-bottom:5px;">
                <label style="color:#38bdf8;">⚡ PERFORMANCE</label>
            </div>
            <div class="input-group">
                <label>CRUISE ALTITUDE (AGL - m)</label>
                <input type="number" id="drone-alt" value="120" onchange="updateGlobalAltitude()">
            </div>
            <div class="input-group">
                <label>CRUISE SPEED (m/s)</label>
                <input type="number" id="drone-speed" value="15" onchange="calculateLogistics()">
            </div>
            <div class="input-group">
                <label>CLIMB SPEED (m/s)</label>
                <input type="number" id="drone-climb-speed" value="5" onchange="calculateLogistics()" title="Speed while going UP">
            </div>
            
            <div style="border-bottom:1px dashed #334155; margin:15px 0 10px 0; padding-bottom:5px;">
                <label style="color:#f59e0b;">🔋 BATTERY LOGIC</label>
            </div>
            <div class="input-group">
                <label>BATTERY CAPACITY (mAh)</label>
                <input type="number" id="drone-bat" value="5000" onchange="calculateLogistics()">
            </div>
            <div class="input-group">
                <label>CONSUMPTION (mAh/min)</label>
                <div style="display:flex; gap:5px;">
                    <input type="number" id="drone-burn-climb" value="300" placeholder="Climb" title="Climb Burn">
                    <input type="number" id="drone-burn-cruise" value="150" placeholder="Cruise" title="Cruise Burn">
                    <input type="number" id="drone-burn-descent" value="50" placeholder="Descent" title="Descent Burn">
                </div>
                <small style="color:#64748b; font-size:9px;">Climb / Cruise / Descent</small>
            </div>
        `;
    } else {
        // --- UÇAK (CESSNA 172 TARZI) ---
        html = `
            <div class="input-group" style="margin-bottom: 15px; background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 4px; border: 1px solid #10b981;">
                <label style="color:#10b981;">🚀 QUICK LOAD PROFILE</label>
                <select id="vehicle-preset-select" onchange="applyVehiclePreset()" style="width:100%; padding:5px; background:#1e293b; color:white; border:1px solid #334155; border-radius:4px; margin-top:5px; outline:none;">
                    <option value="custom_aircraft" selected>Custom Aircraft (Manual)</option>
                    <option value="c172">Cessna 172 Skyhawk</option>
                    <option value="pa28">Piper PA-28 Cherokee</option>
                    <option value="da40">Diamond DA40</option>
                </select>
            </div>
            <div style="border-bottom:1px dashed #334155; margin-bottom:10px; padding-bottom:5px;">
                <label style="color:#38bdf8;">✈️ FLIGHT ENVELOPE</label>
            </div>
            <div class="input-group">
                <label>CRUISE ALTITUDE (MSL - ft)</label>
                <input type="number" id="plane-alt" value="3500" onchange="updateGlobalAltitude()">
            </div>
            <div class="input-group">
                <label>TAS (True Airspeed - kts)</label>
                <div style="display:flex; gap:5px;">
                    <input type="number" id="plane-climb-spd" value="75" placeholder="Climb">
                    <input type="number" id="fuel-speed" value="110" placeholder="Cruise">
                </div>
                <small style="color:#64748b; font-size:9px;">Climb Speed / Cruise Speed</small>
            </div>

            <div style="border-bottom:1px dashed #334155; margin:15px 0 10px 0; padding-bottom:5px;">
                <label style="color:#f59e0b;">⛽ FUEL FLOW (GPH)</label>
            </div>
            <div class="input-group">
                <label>FUEL CAPACITY (Gallons)</label>
                <input type="number" id="fuel-cap" value="50" onchange="calculateLogistics()">
            </div>
            <div class="input-group">
                <label>BURN RATE (Gal/hr)</label>
                <div style="display:flex; gap:5px;">
                    <input type="number" id="plane-burn-climb" value="13" placeholder="Climb">
                    <input type="number" id="fuel-rate" value="9" placeholder="Cruise">
                    <input type="number" id="plane-burn-descent" value="5" placeholder="Descent">
                </div>
                <small style="color:#64748b; font-size:9px;">Climb / Cruise / Descent</small>
            </div>
        `;
    }

    container.innerHTML = html;
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















// Update Total Stats (Standardized V2) 📊
function updateStatsUI(isElectric, totalTimeMin, refSpeed) {
    // Toplam Mesafe Tahmini (Süre * Hız)
    // Not: Bu sadece tahmini bir göstergedir, gerçek mesafe bacakların toplamıdır.
    // Ama UI'da hızlı gösterim için kullanıyoruz.
    
    let distText, timeText;

    if (isElectric) {
        // Drone: Hız (m/s), Süre (dk)
        const totalSeconds = totalTimeMin * 60;
        const distKm = (totalSeconds * refSpeed) / 1000;
        
        distText = `${distKm.toFixed(1)} km`;
        timeText = `${totalTimeMin.toFixed(0)} min`;
    } else {
        // Uçak: Hız (kts), Süre (dk olarak geliyor ama hesap için saate çevirelim)
        const totalHours = totalTimeMin / 60;
        // RefSpeed burada m/s geliyor (calculateLogistics'ten) -> KTS'ye çevir
        const speedKts = refSpeed * 1.94384; 
        const distNM = totalHours * speedKts;
        
        distText = `${distNM.toFixed(1)} NM`;
        
        // Saati (1.5 saat) -> (1h 30m) formatına çevir
        const hrs = Math.floor(totalHours);
        const mins = Math.round((totalHours - hrs) * 60);
        timeText = `${hrs}h ${mins}m`;
    }
    
    document.getElementById('total-stats').innerText = `Est. Range: ${distText} | ETE: ${timeText}`;
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















// 17. Tab Switching Logic (Sağ Panel)
// 17. Tab Switching Logic (GÜNCELLENMİŞ - Grafik Tetikleyicili)
function openTab(tabName) {
    // Tüm içerikleri gizle
    const contents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < contents.length; i++) {
        contents[i].style.display = 'none';
    }

    // Tüm butonların aktifliğini kaldır
    const btns = document.getElementsByClassName('tab-btn');
    for (let i = 0; i < btns.length; i++) {
        btns[i].className = btns[i].className.replace(" active", "");
    }

    // Seçileni aç
    document.getElementById(tabName).style.display = 'block';
    
    // Tıklanan butonu aktif yap
    if (event && event.currentTarget) {
        event.currentTarget.className += " active";
    }

    // 1. Library açıldıysa listeyi yükle
    if (tabName === 'tab-library' && document.getElementById('mission-list-container').children.length <= 1) {
        loadMyMissions();
    }

    // 2. Profile açıldıysa grafiği çiz (YENİ EKLENEN KISIM) 🏔️
    if (tabName === 'tab-profile') {
        // Grafiği çizdir (Henüz fonksiyonu eklemediysen hata vermesin diye kontrol ediyoruz)
        if (typeof updateElevationProfile === "function") {
            updateElevationProfile();
        }
    }
}












// 18. Filter Missions (Arama Kutusu İçin) 🔍
function filterMissions() {
    const input = document.getElementById('mission-search');
    const filter = input.value.toUpperCase();
    const list = document.getElementById('mission-list-container');
    const items = list.getElementsByClassName('mission-item');

    for (let i = 0; i < items.length; i++) {
        const txtValue = items[i].innerText || items[i].textContent;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            items[i].style.display = "flex"; 
        } else {
            items[i].style.display = "none";
        }
    }
}

// 19. Load Missions (YENİ VERSİYON - Sekmeli Yapıya Uygun)
function loadMyMissions() {
    if (!currentUser) {
        document.getElementById('mission-list-container').innerHTML = 
            '<p style="color:#ef4444; font-size:11px; text-align:center; padding:10px;">Please SIGN IN to view your missions.</p>';
        return;
    }

    const container = document.getElementById('mission-list-container');
    container.innerHTML = '<p style="color:#94a3b8; font-size:10px; text-align:center;">Fetching data from cloud...</p>';

    db.collection("missions")
        .where("pilotId", "==", currentUser.uid)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                container.innerHTML = '<p style="color:#94a3b8; font-size:11px; text-align:center; padding:10px;">No saved missions found.</p>';
                return;
            }

            let html = '';
            querySnapshot.forEach((doc) => {
                const mission = doc.data();
                const date = mission.createdAt ? new Date(mission.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
                const vehicleName = mission.vehicle ? mission.vehicle.toUpperCase().replace('_', ' ') : 'UNKNOWN';
                const missionName = mission.missionName || `${vehicleName} - ${date}`;

                html += `
                    <div class="mission-item" onclick="restoreMission('${doc.id}')">
                        <div class="mission-info">
                            <strong style="color:#38bdf8;">${missionName}</strong><br>
                            <span class="mission-date">${date} • ${mission.points.length} WPs</span>
                        </div>
                        <button class="mission-delete-btn" onclick="deleteMission(event, '${doc.id}')" title="Delete">🗑️</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        })
        .catch((error) => {
            console.error("Error loading missions:", error);
            container.innerHTML = '<p style="color:#ef4444; font-size:10px; text-align:center;">Error: ' + error.message + '</p>';
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













// Menü açma/kapama hatasını çözer
function toggleMenu(id) {
    const section = document.getElementById(id);
    if (section) {
        section.style.display = (section.style.display === 'none' || section.style.display === '') ? 'block' : 'none';
    }
}




// "Find & Fly" butonunun ana motoru (ASENKRON OLMALI)
// Başına async eklediğinden emin ol
async function generateSmartRoute() {
    const depInput = document.getElementById('dep-input').value;
    const arrInput = document.getElementById('arr-input').value;
    const btn = document.getElementById('btn-create-route');

    if (!depInput || !arrInput) { 
        showToast("Please fill both points!", "error"); 
        return; 
    }

    btn.innerText = "🔍 ROUTING...";
    
    // Artık await burada hata vermeyecek
    const dep = await resolveLocation(depInput);
    const arr = await resolveLocation(arrInput);

    if (dep && arr) {
        waypoints = [
            { lat: dep.lat, lon: dep.lon, alt: dep.alt, cartesian: Cesium.Cartesian3.fromDegrees(dep.lon, dep.lat, dep.alt) },
            { lat: arr.lat, lon: arr.lon, alt: arr.alt, cartesian: Cesium.Cartesian3.fromDegrees(arr.lon, arr.lat, arr.alt) }
        ];
        renderVisuals(-1);
        updateUI();
        calculateLogistics();
        
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees((dep.lon + arr.lon) / 2, (dep.lat + arr.lat) / 2, 40000)
        });
    }
    btn.innerText = "🚀 FIND & FLY";
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
        if (API_KEY === "86b7d3ff9069982fcbdca23d170f0a70") {
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















// 20. Elevation Profile Generator (Chart.js Entegrasyonu) 🏔️
let elevationChart = null;

async function updateElevationProfile() {
    // Sadece PROFILE sekmesi açıksa ve en az 2 nokta varsa çalıştır (Performans için)
    const tabProfile = document.getElementById('tab-profile');
    if (tabProfile.style.display === 'none' || waypoints.length < 2) return;

    document.getElementById('profile-loading').style.display = 'block';

    // 1. Rota boyunca örnekleme noktaları oluştur
    const terrainSamplePositions = [];
    const flightAltitudes = [];
    const distances = [];
    let totalDist = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i+1];
        
        // Her bacak için 10 örnek nokta al (Daha hassas grafik için artırılabilir)
        const samples = 10; 
        for (let j = 0; j <= samples; j++) {
            const factor = j / samples;
            const lon = Cesium.Math.lerp(start.lon, end.lon, factor);
            const lat = Cesium.Math.lerp(start.lat, end.lat, factor);
            const alt = Cesium.Math.lerp(start.alt, end.alt, factor);
            
            terrainSamplePositions.push(Cesium.Cartographic.fromDegrees(lon, lat));
            flightAltitudes.push(alt); // Uçuş irtifası
            
            // Mesafeyi hesapla (X ekseni için)
            if (j > 0 || i > 0) {
                // Basit mesafe hesabı (Chart X ekseni için yaklaşık değer yeterli)
                totalDist += Cesium.Cartesian3.distance(
                    Cesium.Cartesian3.fromDegrees(lon, lat),
                    Cesium.Cartesian3.fromDegrees(terrainSamplePositions[terrainSamplePositions.length-2].longitude * 180/Math.PI, terrainSamplePositions[terrainSamplePositions.length-2].latitude * 180/Math.PI)
                );
            }
            distances.push((totalDist / 1000).toFixed(1)); // km cinsinden
        }
    }

    try {
        // 2. Cesium'dan Arazi Yüksekliklerini İste (Async)
        const updatedPositions = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, terrainSamplePositions);
        const terrainHeights = updatedPositions.map(p => p.height || 0);

        // 3. Grafiği Çiz
        renderChart(distances, terrainHeights, flightAltitudes);
    } catch (error) {
        console.error("Terrain sampling failed:", error);
    } finally {
        document.getElementById('profile-loading').style.display = 'none';
    }
}

function renderChart(labels, terrainData, flightData) {
    const ctx = document.getElementById('elevationChart').getContext('2d');

    // Eğer eski grafik varsa yok et (Yenisini çizmek için)
    if (elevationChart) {
        elevationChart.destroy();
    }

    // Güvenlik Kontrolü: Çarpışma var mı?
    // Uçuş çizgisi rengi: Güvenli ise YEŞİL, Çarpışma varsa KIRMIZI
    const flightColor = flightData.map((alt, index) => {
        return alt < terrainData[index] ? 'red' : '#4ade80'; // Tehlike / Güvenli
    });

    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, // X Ekseni (Mesafe)
            datasets: [
                {
                    label: 'Terrain (Ground)',
                    data: terrainData,
                    borderColor: '#94a3b8',
                    backgroundColor: 'rgba(148, 163, 184, 0.5)',
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 1
                },
                {
                    label: 'Flight Path',
                    data: flightData,
                    borderColor: '#38bdf8', // Varsayılan Mavi
                    segment: {
                        borderColor: ctx => {
                            // Çizgi segmenti rengi (Çarpışma kontrolü)
                            const i = ctx.p0DataIndex;
                            return flightData[i] < terrainData[i] ? '#ef4444' : '#4ade80';
                        }
                    },
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    display: true, 
                    title: { display: true, text: 'Distance (km)', color:'#64748b' },
                    ticks: { color: '#64748b', maxTicksLimit: 5 }
                },
                y: { 
                    display: true, 
                    title: { display: true, text: 'Altitude (m)', color:'#64748b' },
                    ticks: { color: '#64748b' },
                    grid: { color: '#334155' }
                }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: {size: 10} } }
            }
        }
    });
}


















// 21. Sync Grid Inputs (Slider ve Text Kutusunu Eşle) 🎚️
function syncGridInputs(source) {
    const spacingSlider = document.getElementById('grid-spacing-slider');
    const spacingText = document.getElementById('grid-spacing');
    const angleSlider = document.getElementById('grid-angle-slider');
    const angleText = document.getElementById('grid-angle');

    if (source === 'spacing') spacingText.value = spacingSlider.value;
    if (source === 'spacing_text') spacingSlider.value = spacingText.value;
    
    if (source === 'angle') angleText.value = angleSlider.value;
    if (source === 'angle_text') angleSlider.value = angleText.value;
}













// 22. Generate Smart Search Grid (Polygon Clipping / Scanline Algo) 🕸️✂️
async function generateGridMission() {
    if (waypoints.length < 3) {
        alert("Please define an area with at least 3 points first.");
        return;
    }
    if (!confirm("This will replace current points with a Polygon-Clipped Grid. Continue?")) return;

    const btn = document.querySelector('button[onclick="generateGridMission()"]');
    const oldText = btn.innerText;
    btn.innerText = "⏳ CLIPPING POLYGON...";
    btn.disabled = true;

    try {
        // --- 1. AYARLARI AL ---
        const spacingMeters = parseFloat(document.getElementById('grid-spacing').value);
        const angleDeg = parseFloat(document.getElementById('grid-angle').value);
        let targetAlt = parseFloat(document.getElementById('grid-alt').value);
        const useTerrain = document.getElementById('terrain-follow').checked;

        // --- 2. ROTASYON VE KOORDİNAT SİSTEMİ ---
        // Merkez noktayı bul (Döndürme işlemi için pivot)
        let sumLat = 0, sumLon = 0;
        waypoints.forEach(p => { sumLat += p.lat; sumLon += p.lon; });
        const centerLat = sumLat / waypoints.length;
        const centerLon = sumLon / waypoints.length;

        // Derece dönüşümü (Radyan)
        const rad = -angleDeg * (Math.PI / 180); // Ters çevirerek düzleştiriyoruz

        // Yardımcı Fonksiyon: Lat/Lon -> Metre (Rotated)
        function project(lat, lon) {
            const dy = (lat - centerLat) * 111111;
            const dx = (lon - centerLon) * 111111 * Math.cos(centerLat * Math.PI/180);
            return {
                x: dx * Math.cos(rad) - dy * Math.sin(rad),
                y: dx * Math.sin(rad) + dy * Math.cos(rad)
            };
        }

        // Yardımcı Fonksiyon: Metre (Rotated) -> Lat/Lon
        function unproject(x, y) {
            const invRad = angleDeg * (Math.PI / 180); // Geri döndür
            const dx = x * Math.cos(invRad) - y * Math.sin(invRad);
            const dy = x * Math.sin(invRad) + y * Math.cos(invRad);
            return {
                lat: centerLat + (dy / 111111),
                lon: centerLon + (dx / (111111 * Math.cos(centerLat * Math.PI/180)))
            };
        }

        // --- 3. POLYGON SINIRLARINI HESAPLA ---
        // Tüm noktaları sanal düzleme (metre) çevir
        const polyPoints = waypoints.map(p => project(p.lat, p.lon));

        // Sanal düzlemde min/max Y değerlerini bul (Tarama aralığı)
        let minY = Infinity, maxY = -Infinity;
        polyPoints.forEach(p => {
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        // --- 4. SCANLINE ALGORİTMASI (SATIR TARAMA) ---
        let tempPoints = [];
        let y = minY; // En alttan başla
        let direction = 1; // 1: Sağa, -1: Sola

        while (y <= maxY) {
            // Bu Y yüksekliğindeki yatay çizginin, polygon kenarlarıyla kesişimlerini bul
            let intersections = [];
            
            for (let i = 0; i < polyPoints.length; i++) {
                const p1 = polyPoints[i];
                const p2 = polyPoints[(i + 1) % polyPoints.length]; // Bir sonraki nokta (döngüsel)

                // Çizgi p1 ve p2'nin Y değerleri arasında mı?
                if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
                    // X kesişim noktasını bul (Lineer Enterpolasyon)
                    const x = p1.x + (y - p1.y) * (p2.x - p1.x) / (p2.y - p1.y);
                    intersections.push(x);
                }
            }

            // Kesişimleri küçükten büyüğe sırala (Soldan sağa)
            intersections.sort((a, b) => a - b);

            // Çiftler halinde rota oluştur (Giriş -> Çıkış)
            for (let i = 0; i < intersections.length; i += 2) {
                if (i + 1 >= intersections.length) break;

                const xStart = intersections[i];     // Giriş
                const xEnd = intersections[i + 1];   // Çıkış

                // Zikzak yönüne göre noktaları ekle
                if (direction === 1) {
                    tempPoints.push(unproject(xStart, y));
                    tempPoints.push(unproject(xEnd, y));
                } else {
                    tempPoints.push(unproject(xEnd, y));
                    tempPoints.push(unproject(xStart, y));
                }
            }

            y += spacingMeters;
            direction *= -1; // Yön değiştir
        }

        // --- 5. TERRAIN / YÜKSEKLİK HESABI ---
        let finalWaypoints = [];
        
        if (useTerrain) {
            const positionsToQuery = tempPoints.map(p => Cesium.Cartographic.fromDegrees(p.lon, p.lat));
            // Cesium'dan arazi verisini çek
            const updatedPositions = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positionsToQuery);
            
            updatedPositions.forEach(pos => {
                const groundHeight = pos.height || 0;
                const flightAlt = groundHeight + targetAlt;
                finalWaypoints.push({
                    lat: Cesium.Math.toDegrees(pos.latitude),
                    lon: Cesium.Math.toDegrees(pos.longitude),
                    alt: flightAlt,
                    cartesian: Cesium.Cartesian3.fromRadians(pos.longitude, pos.latitude, flightAlt)
                });
            });
        } else {
            // Düz Uçuş (Flat Plane)
            const baseAlt = waypoints[0].alt; // Referans yükseklik
            tempPoints.forEach(p => {
                const flightAlt = baseAlt + targetAlt;
                finalWaypoints.push({
                    lat: p.lat,
                    lon: p.lon,
                    alt: flightAlt,
                    cartesian: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, flightAlt)
                });
            });
        }

        // --- 6. GÖRSELİ GÜNCELLE ---
        waypoints = finalWaypoints;
        viewer.entities.removeAll();
        
        // Noktaları daha küçük çiz (Görsel kirliliği önlemek için pixelSize 6 yaptık)
        waypoints.forEach(wp => {
            viewer.entities.add({
                position: wp.cartesian,
                point: { pixelSize: 6, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 }
            });
        });

        renderVisuals(-1);
        updateUI();

        // Profili güncelle
        if(typeof updateElevationProfile === 'function') {
            document.getElementById('tab-profile').style.display = 'block';
            updateElevationProfile();
        }

        alert(`✅ Clipped Grid Generated!\nPoints: ${waypoints.length}\nMode: ${useTerrain ? 'AGL (Terrain)' : 'MSL (Flat)'}`);

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}
















// 23. Toast Notification System (Alert Yerine) 🍞
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    // Element oluştur
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    // Listeye ekle
    container.appendChild(toast);

    // 3 saniye sonra sil
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Eski alert'i ez (İsteğe bağlı, ama kodun her yerini değiştirmemek için pratik)
window.alert = function(msg) {
    showToast(msg, 'warning');
};


















// 24. AERO LAYER (ÜCRETSİZ & LİMİTSİZ ALTERNATİF - OSM) 🌍
let aeroImageryLayer = null;

function toggleAeroLayer() {
    const isVisible = document.getElementById('aero-layer-toggle').checked;

    if (isVisible) {
        // Varsa eski katmanı temizle
        if (aeroImageryLayer) {
            viewer.imageryLayers.remove(aeroImageryLayer);
            aeroImageryLayer = null;
        }

        try {
            // OpenAIP (Paralı) YERİNE -> OpenStreetMap (Ücretsiz/Limitsiz)
            const provider = new Cesium.UrlTemplateImageryProvider({
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                credit: 'Map data © OpenStreetMap contributors',
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                maximumLevel: 19
            });

            aeroImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
            
            // Alt katman (Uydu) görünsün diye şeffaflık veriyoruz
            aeroImageryLayer.alpha = 0.6; 
            
            // Katmanı en üste taşı
            viewer.imageryLayers.raiseToTop(aeroImageryLayer);
            
            showToast("Harita katmanı aktif (OSM Mode).", "success");

        } catch (e) {
            console.error(e);
            showToast("Katman hatası.", "error");
        }
    } else {
        if (aeroImageryLayer) {
            viewer.imageryLayers.remove(aeroImageryLayer);
            aeroImageryLayer = null;
            showToast("Katman gizlendi.", "info");
        }
    }
}
























    


























// =========================================================
// 🚀 NAVIVORTEX FLIGHT WIZARD (AdSense Compatible Mode) 💰
// =========================================================

// Global Veritabanı (RAM'de tutulacak)
window.GLOBAL_AIRPORTS = [];
window.isDBReady = false;




























async function initGlobalAirportDB() {
    const statusLabel = document.getElementById('db-status-label');
    const btn = document.getElementById('btn-create-route');
    try {
        const response = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
        const rawData = await response.json();
        // Sadece lazım olanları alıp hafızayı yormuyoruz
        window.GLOBAL_AIRPORTS = Object.entries(rawData).map(([icao, data]) => ({
            code: icao, iata: data.iata || "", name: data.name, city: data.city || "",
            lat: data.lat, lon: data.lon, alt: data.elevation
        }));
        window.isDBReady = true;
        if(statusLabel) { statusLabel.innerText = "✅ Ready"; statusLabel.style.color = "#4ade80"; }
        if(btn) btn.disabled = false;
    } catch (e) { console.error("DB Load Error", e); }
}

async function resolveLocation(query) {
    if (!query) return null;
    const q = query.trim().toUpperCase();

    // A) KOORDİNAT KONTROLÜ (40.1, 29.5 gibi)
    const coordParts = q.split(',');
    if (coordParts.length === 2) {
        const lat = parseFloat(coordParts[0]);
        const lon = parseFloat(coordParts[1]);
        if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, alt: 100, name: "Target Point" };
    }

    // B) HAVALİMANI DB KONTROLÜ
    if (window.isDBReady) {
        // Eğer input "SAW - Sabiha..." formatındaysa sadece "SAW" kısmını al
        let searchCode = q.includes(' - ') ? q.split(' - ')[0].trim() : q;
        
        const found = window.GLOBAL_AIRPORTS.find(item => 
            item.code === searchCode || item.iata === searchCode
        );
        
        if (found) return {
            lat: found.lat,
            lon: found.lon,
            alt: (found.alt || 300) * 0.3048, // Feet to Meter
            name: found.name
        };
    }

    // C) OSM FALLBACK (Şehir isimleri için)
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && data.length > 0) return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            alt: 100,
            name: data[0].display_name.split(',')[0]
        };
    } catch (e) { console.error("Search error:", e); }
    return null;
}













function handleInput(input, boxId) {
    const query = input.value.trim().toUpperCase();
    const box = document.getElementById(boxId);

    if (query.length < 2 || !window.isDBReady) {
        box.style.display = 'none';
        return;
    }

    // Gelişmiş Filtre: Kod, IATA, İsim veya Şehir eşleşmesi
    const results = window.GLOBAL_AIRPORTS.filter(item => 
        (item.code && item.code.toUpperCase().includes(query)) || 
        (item.iata && item.iata.toUpperCase().includes(query)) || 
        (item.name && item.name.toUpperCase().includes(query)) ||
        (item.city && item.city.toUpperCase().includes(query))
    ).slice(0, 5); // Sonuçları 5 ile sınırla

    box.innerHTML = '';
    if (results.length > 0) {
        box.style.display = 'block';
        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            const displayCode = item.iata || item.code;
            div.innerHTML = `<strong>${displayCode}</strong> - ${item.name} <span style="opacity:0.5; font-size:10px;">(${item.city})</span>`;
            div.onclick = () => {
                input.value = `${displayCode} - ${item.name}`; // Seçilen format
                box.style.display = 'none';
            };
            box.appendChild(div);
        });
    } else { box.style.display = 'none'; }
}
























function setupFlightPlanner() {
    const panel = document.getElementById('params-panel');
    if (!panel || document.getElementById('flight-wizard-section')) return;
    const div = document.createElement('div');
    div.id = 'flight-wizard-section';
    div.className = 'menu-section';
    div.innerHTML = `
        <div class="menu-header" onclick="toggleMenu('wizard-content')"><span style="color:#38bdf8;">✈️ FLIGHT WIZARD</span><span id="db-status-label" style="font-size:10px;">⏳</span></div>
        <div id="wizard-content" class="menu-content" style="display:block; padding:10px;">
            <div class="input-wrapper"><input type="text" id="dep-input" placeholder="Departure..." onkeyup="handleInput(this, 'dep-suggestions')" autocomplete="off" style="width:100%;">
            <div id="dep-suggestions" class="suggestion-box"></div></div>
            <div class="input-wrapper" style="margin-top:10px;"><input type="text" id="arr-input" placeholder="Arrival..." onkeyup="handleInput(this, 'arr-suggestions')" autocomplete="off" style="width:100%;">
            <div id="arr-suggestions" class="suggestion-box"></div></div>
            <button class="btn-primary" id="btn-create-route" onclick="generateSmartRoute()" style="width:100%; margin-top:10px;">🚀 FIND & FLY</button>
        </div>`;
    panel.prepend(div);
}


























// =========================================================
// 🚀 FAZ 1 (ADIM 2): KML & GEOJSON IMPORT ENGINE
// =========================================================
let importedLayers = []; // Yüklenen harici katmanları hafızada tutmak için

async function importMapData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    showToast(`Loading ${file.name}...`, "info");

    try {
        let dataSource;

        // Dosya tipine göre Cesium'un okuyucusunu seçiyoruz
        if (fileName.endsWith('.kml') || fileName.endsWith('.kmz')) {
            dataSource = await Cesium.KmlDataSource.load(file, {
                camera: viewer.scene.camera,
                canvas: viewer.scene.canvas,
                clampToGround: true // Çizgileri araziye yapıştırır
            });
        } else if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
            // GeoJSON okuma işlemi
            const fileText = await file.text();
            const jsonData = JSON.parse(fileText);
            dataSource = await Cesium.GeoJsonDataSource.load(jsonData, {
                clampToGround: true,
                stroke: Cesium.Color.fromCssColorString('#10b981'), // Yeşil çizgi
                fill: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.2),
                strokeWidth: 3
            });
        } else {
            alert("Unsupported file format! Please upload .kml, .kmz, or .geojson");
            return;
        }

        // Haritaya Ekle
        viewer.dataSources.add(dataSource);
        importedLayers.push(dataSource);

        // Kamerayı yüklenen dosyanın sınırlarına (bölgeye) uçur
        viewer.flyTo(dataSource);
        
        showToast("✅ Boundary File Imported Successfully!", "success");

        // Input'u sıfırla ki aynı dosyayı tekrar yüklemek istersek çalışsın
        event.target.value = ''; 

    } catch (error) {
        console.error("Import Error: ", error);
        alert("Could not read the file. Ensure it is a valid KML/GeoJSON format.");
    }
}




















// =========================================================
// 🚀 FAZ 2 (ADIM 1): PHOTOGRAMMETRY & CAMERA MATH ENGINE
// =========================================================

// Popüler Kameraların Sensör Veritabanı
// sw: Sensör Genişliği (mm), sh: Sensör Yüksekliği (mm), fl: Odak Uzaklığı / Focal Length (mm)
const CAMERAS = {
    "m3e": { name: "Mavic 3E", sw: 17.3, sh: 13.0, fl: 12.29 },
    "p4rtk": { name: "Phantom 4 RTK", sw: 13.2, sh: 8.8, fl: 8.8 },
    "zenmuse_p1": { name: "Zenmuse P1 (35mm)", sw: 35.9, sh: 24.0, fl: 35.0 }
};

function calculatePhotogrammetry() {
    const camId = document.getElementById('camera-sensor').value;
    const overlapDiv = document.getElementById('overlap-settings');
    
    // UI Elementleri (Müdahale edeceğimiz kutular)
    const spacingInput = document.getElementById('grid-spacing');
    const spacingSlider = document.getElementById('grid-spacing-slider');
    const altitude = parseFloat(document.getElementById('grid-alt').value);

    if (camId === 'manual') {
        // Kullanıcı manuel moddaysa sliderları serbest bırak ve menüyü gizle
        overlapDiv.style.display = 'none';
        spacingInput.disabled = false;
        spacingSlider.disabled = false;
        document.getElementById('photo-interval-info').innerText = "";
        return;
    }

    // Kamera seçildiyse Overlap menüsünü göster ve manuel kutuları kilitle
    overlapDiv.style.display = 'block';
    spacingInput.disabled = true;
    spacingSlider.disabled = true;

    // Formül Değerlerini Çek
    const cam = CAMERAS[camId];
    const sideLap = parseFloat(document.getElementById('side-lap').value) / 100; // Örn: %70 -> 0.70
    const frontLap = parseFloat(document.getElementById('front-lap').value) / 100; // Örn: %80 -> 0.80

    // 📐 FOTOGRAMETRİ MATEMATİĞİ (GSD & İzdüşüm)
    // Yerdeki Görüntü Genişliği (Image Width on Ground) = (Sensör Genişliği * İrtifa) / Odak Uzaklığı
    const groundWidth = (cam.sw * altitude) / cam.fl; 
    
    // Yerdeki Görüntü Yüksekliği (Image Height on Ground)
    const groundHeight = (cam.sh * altitude) / cam.fl;

    // 1. LEG SPACING (Satırlar arası mesafe = Side-lap'ten kalan boşluk)
    let legSpacing = groundWidth * (1 - sideLap);
    
    // 2. PHOTO INTERVAL (Aynı satırda kaç metrede bir fotoğraf çekilecek = Front-lap'ten kalan boşluk)
    let photoInterval = groundHeight * (1 - frontLap);

    // Güvenlik sınırları (Grid çok küçük olmasın diye)
    if (legSpacing < 2) legSpacing = 2;

    // Arayüzü Güncelle (Küsüratları atıp yuvarlıyoruz)
    spacingInput.value = Math.round(legSpacing);
    spacingSlider.value = Math.round(legSpacing);
    
    // Kullanıcıya bilgi ver
    document.getElementById('photo-interval-info').innerText = 
        `Auto Spacing: ${Math.round(legSpacing)}m | Photo Every: ${Math.round(photoInterval)}m`;
}






















// =========================================================
// 🚀 FAZ 2 (ADIM 2): 3D AIRSPACE & NO-FLY ZONE (NFZ) SCANNER
// =========================================================
let airspaceEntities = [];

function scanAirspace() {
    // 1. Önceki taramadan kalan kırmızı bölgeleri temizle
    airspaceEntities.forEach(e => viewer.entities.remove(e));
    airspaceEntities = [];

    // Veritabanı inmiş mi kontrol et
    if (!window.isDBReady || !window.GLOBAL_AIRPORTS) {
        showToast("Airport Database is still loading...", "warning");
        return;
    }

    const btn = document.getElementById('btn-radar');
    btn.innerText = "⏳ SCANNING...";
    btn.style.background = "rgba(245, 158, 11, 0.8)"; // Turuncuya dön

    setTimeout(() => {
        // 2. Kameranın şu an baktığı merkez koordinatı al
        const cameraPt = viewer.camera.positionCartographic;
        const camLat = Cesium.Math.toDegrees(cameraPt.latitude);
        const camLon = Cesium.Math.toDegrees(cameraPt.longitude);

        let count = 0;

        // 3. Hafızadaki 28.000 havalimanını tara
        window.GLOBAL_AIRPORTS.forEach(ap => {
            // Basit mesafe filtresi (Kameraya yaklaşık 100 km'den yakın olanlar)
            const dLat = ap.lat - camLat;
            const dLon = ap.lon - camLon;
            const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);

            if (distDeg < 1.0) { // 1.0 derece yaklaşık 111 km yapar
                
                // 4. Havalimanının etrafına 3D Kırmızı Silindir (CTR) Çiz
                const entity = viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(ap.lon, ap.lat, 500), // Silindirin merkezi 500m yüksekte
                    cylinder: {
                        length: 1000, // 1000 metre yükseklik
                        topRadius: 3000, // 3 KM yarıçap (Drone yasak bölgesi)
                        bottomRadius: 3000,
                        material: Cesium.Color.RED.withAlpha(0.2), // Şeffaf Kırmızı Cam
                        outline: true,
                        outlineColor: Cesium.Color.RED.withAlpha(0.5)
                    },
                    label: {
                        text: "⛔ NFZ: " + (ap.iata || ap.code),
                        font: '14px sans-serif',
                        fillColor: Cesium.Color.WHITE,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -30),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY // Uzaktan da yazısı okunsun
                    }
                });

                airspaceEntities.push(entity);
                count++;
            }
        });

        // 5. İşlem bitti, butonu eski haline getir
        btn.innerText = "📡 SCAN AIRSPACE (NFZ)";
        btn.style.background = "rgba(239, 68, 68, 0.8)";
        
        if (count > 0) {
            showToast(`⚠️ Radar found ${count} Restricted Zones (NFZ) near you.`, "error");
        } else {
            showToast("✅ Airspace is CLEAR.", "success");
        }

    }, 500); // UI donmasın diye yarım saniye gecikmeli çalıştırıyoruz
}






















































                          



// --- FEEDBACK MODAL ---
function openFeedback() { document.getElementById('feedback-modal').style.display = 'block'; }
function closeFeedback() { document.getElementById('feedback-modal').style.display = 'none'; }







// 8. Başlatıcı (TEMİZLENMİŞ HALİ)
window.onload = () => {
    initCesium();               // Haritayı ve Handler'ı kurar
    updateVehicleParams();      // Ayarları çeker
    initGlobalAirportDB(); // Veritabanını indirir (YENİ EKLENDİ)
    setupFlightPlanner();
};





// Sayfa yüklendiğinde varsayılan araç ayarlarını getir:
updateVehicleParams();





