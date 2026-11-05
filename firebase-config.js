/* Configuración de Firebase compartida por las 3 apps.
   Sale de: Consola de Firebase → ⚙️ Configuración del proyecto → Tus apps → Config.
   No es secreta: lo que protege los datos son las reglas de Firestore. */
window.FB_CONFIG = {
  apiKey: "AIzaSyDHUFJlyHQ2JrwP1kK-4nYDNrWB5wdgfag",
  authDomain: "inventario-casa-a5f71.firebaseapp.com",
  projectId: "inventario-casa-a5f71",
  storageBucket: "inventario-casa-a5f71.firebasestorage.app",
  messagingSenderId: "32133213703",
  appId: "1:32133213703:web:ce3e3f67cb78e5683a04a2"
};

/* Devuelve la config a usar: la de este archivo, o la que se haya pegado a mano en Ajustes. */
window.getFbConfig = function () {
  if (window.FB_CONFIG && window.FB_CONFIG.apiKey) return window.FB_CONFIG;
  try {
    const c = JSON.parse(localStorage.getItem('cfg_v2') || '{}');
    if (c.fbCfg) return JSON.parse(c.fbCfg);
  } catch (e) {}
  return null;
};
