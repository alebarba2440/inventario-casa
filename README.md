# Nuestras apps

App web (Inventario · Ahorros · Vacaciones) publicada en Firebase Hosting.

## Estructura
- `index.html` → inicio con las 3 tarjetas (tocar la imagen lleva a cada app)
- `inventario.html`, `ahorros.html`, `vacaciones.html` → cada app
- `img/` → imágenes optimizadas que usa el inicio
- `logo3.png` → ícono de la app
- Las fotos originales (`*.PNG`, `ahorros.JPG`, `inventario.png`) quedan en el repo pero **no** se publican.

## Datos
La config de Firebase se pega una sola vez dentro de Inventario → "Sincronización Firebase"
y queda guardada en el navegador. Ahorros y Vacaciones usan la misma.
No hay claves escritas en el código.

## Publicar en Firebase
```
firebase login
firebase use --add      (solo la 1ª vez: elegir el proyecto)
firebase deploy --only hosting
```
