const initialProducts = [
  { id: 1, name: "Egg Pullet", category: "Chicken", price: 4500, unit: "pcs", stock: 100 },
  { id: 2, name: "Egg Layer", category: "Chicken", price: 5200, unit: "pcs", stock: 80 },
  { id: 3, name: "Live Broiler (1kg)", category: "Chicken", price: 3500, unit: "pcs", stock: 50 },
  { id: 4, name: "Live Broiler (1.5kg)", category: "Chicken", price: 5000, unit: "pcs", stock: 30 },
  { id: 5, name: "Live Broiler (2kg)", category: "Chicken", price: 6500, unit: "pcs", stock: 20 },
  { id: 6, name: "Frozen Whole Chicken", category: "Chicken", price: 4200, unit: "kg", stock: 25 },
  { id: 7, name: "Chicken Lap", category: "Chicken", price: 3800, unit: "kg", stock: 40 },
  { id: 8, name: "Chicken Breast", category: "Chicken", price: 4500, unit: "kg", stock: 35 },
  { id: 9, name: "Chicken Wings", category: "Chicken", price: 3200, unit: "kg", stock: 45 },
  { id: 10, name: "Chicken Drumstick", category: "Chicken", price: 3600, unit: "kg", stock: 38 },
  { id: 11, name: "Turkey (Whole)", category: "Chicken", price: 12000, unit: "pcs", stock: 10 },
  { id: 12, name: "Turkey Wings", category: "Chicken", price: 5500, unit: "kg", stock: 15 },

  { id: 13, name: "Hake 3 Shote 30kg", category: "Fish", price: 85000, unit: "carton", stock: 5 },
  { id: 14, name: "Hake 2 Shote 30kg", category: "Fish", price: 92000, unit: "carton", stock: 8 },
  { id: 15, name: "Hake 1 Shote 30kg", category: "Fish", price: 98000, unit: "carton", stock: 6 },
  { id: 16, name: "Croaker Fish (Big)", category: "Fish", price: 18000, unit: "pcs", stock: 12 },
  { id: 17, name: "Croaker Fish (Medium)", category: "Fish", price: 12000, unit: "pcs", stock: 18 },
  { id: 18, name: "Croaker Fish (Small)", category: "Fish", price: 7500, unit: "pcs", stock: 25 },
  { id: 19, name: "Tilapia Fish (Big)", category: "Fish", price: 6500, unit: "pcs", stock: 30 },
  { id: 20, name: "Tilapia Fish (Medium)", category: "Fish", price: 4500, unit: "pcs", stock: 40 },
  { id: 21, name: "Mackerel (Titus) Frozen", category: "Fish", price: 3200, unit: "kg", stock: 50 },
  { id: 22, name: "Mackerel (Shawa) Frozen", category: "Fish", price: 2800, unit: "kg", stock: 55 },
  { id: 23, name: "Catfish (Fresh)", category: "Fish", price: 5500, unit: "kg", stock: 20 },
  { id: 24, name: "Catfish (Smoked)", category: "Fish", price: 8500, unit: "kg", stock: 15 },
  { id: 25, name: "Sardine Carton", category: "Fish", price: 28000, unit: "carton", stock: 7 },
  { id: 26, name: "Panla Fish (Dry)", category: "Fish", price: 15000, unit: "bag", stock: 4 },
  { id: 27, name: "Stockfish (Okporoko)", category: "Fish", price: 22000, unit: "bag", stock: 3 },
  { id: 28, name: "Kpomo Carton", category: "Fish", price: 45000, unit: "carton", stock: 2 }
];

const BUSINESS_INFO = {
  name: "Eghale Cold Room",
  parent: "Edekere Richmond Sons and Ventures",
  address: "[Pending - Owner will provide address]",
  phone: "[Pending - +234 XXX XXX XXXX]",
  phone2: "[Pending - +234 XXX XXX XXXX]",
  email: "[Pending - owner@email.com]",
  whatsapp: "[Pending - WhatsApp line]",
  website: "[Pending]",
  manager: "[Pending - Manager Name]",
  tagline: "Fresh Chicken & Fish - Always Quality",
  tagline2: "Home of Affordable Frozen Foods",
  brandColors: {
    red: "#D32F2F",
    blue: "#1976D2",
    green: "#388E3C"
  },
  logoPath: "assets/img/eghalecrlogo.png",
  bankInfo: {
    name: "[Pending - Bank Name]",
    account: "[Pending - Account Number]",
    accountName: "Edekere Richmond Sons & Ventures"
  }
};

const ADMIN_DEFAULTS = {
  email: "admin@edekerecr.com",
  password: "Eghale2024!"
};

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMT7lK6bSsXuadgsJhGDSuyhtFzrpK7U0",
  authDomain: "edekerecr-a1479.firebaseapp.com",
  projectId: "edekerecr-a1479",
  storageBucket: "edekerecr-a1479.firebasestorage.app",
  messagingSenderId: "673327269254",
  appId: "1:673327269254:web:35624fd92d8d9f70549807",
  measurementId: "G-9C4YNTEL8K"
};
