const VEHICLE_CONFIGS = {
    electric_drone: {
        isElectric: true,
        unit: "Metric (km/m/s)",
        inputs: [
            { id: "drone-weight", label: "Take-off Weight (kg)", value: 1.5 },
            { id: "drone-bat", label: "Battery Capacity (mAh)", value: 5000 },
            { id: "drone-speed", label: "Cruise Speed (m/s)", value: 15 }
        ]
    },
    light_aircraft: {
        isElectric: false,
        unit: "Aviation (NM/knots)",
        inputs: [
            { id: "fuel-cap", label: "Fuel Capacity (Liters)", value: 150 },
            { id: "fuel-speed", label: "Ground Speed (knots)", value: 110 },
            { id: "fuel-rate", label: "Fuel Flow (L/Hour)", value: 35 }
        ]
    }
    // İleride buraya Helicopter, Jet vb. eklenecek.
};
