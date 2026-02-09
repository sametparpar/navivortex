const VEHICLE_CONFIGS = {
    electric_drone: {
        isElectric: true,
        unitSystem: "metric", // Metrik sistem
        defaultAlt: 50, // 50 metre irtifa
        inputs: [
            { id: "drone-weight", label: "Take-off Weight (kg)", value: 1.5 },
            { id: "drone-bat", label: "Battery Capacity (mAh)", value: 5000 },
            { id: "drone-speed", label: "Cruise Speed (m/s)", value: 15 }
        ]
    },
    light_aircraft: {
        isElectric: false,
        unitSystem: "aviation", // Havacılık sistemi (NM, Knots)
        defaultAlt: 1000, // ~3000 feet irtifa
        inputs: [
            { id: "fuel-cap", label: "Fuel Capacity (Liters)", value: 150 },
            { id: "fuel-speed", label: "Ground Speed (knots)", value: 110 },
            { id: "fuel-rate", label: "Fuel Flow (L/Hour)", value: 35 }
        ]
    }
};
    // İleride buraya Helicopter, Jet vb. eklenecek.
};
