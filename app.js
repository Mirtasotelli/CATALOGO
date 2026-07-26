// Log inicial para diagnóstico
console.log('app.js cargado');

// Captura global de errores para ayudar a depurar en producción
window.addEventListener('error', function (e) {
  console.error('Error global detectado en app.js:', e.error || e.message, e.filename + ':' + e.lineno);
});

// ==========================================
// CONFIGURACIÓN INICIAL
// ==========================================
const URL_CSV_DIRECTO = "https://raw.githubusercontent.com/tevo-mdp/prueba_caipser/main/productos.csv?v=" + new Date().getTime(); 
const MI_NUMERO_WHATSAPP = "5492235310709"; 

// --- INTERRUPTOR DE PROMOCIÓN MAYORISTA ---
const ACTIVAR_MAYORISTA = false; // true = Activado, false = Desactivado
const CANTIDAD_MINIMA_MAYORISTA = 5; // Unidades para aplicar el precio por mayor

// --- UMBRAL FOMO (URGENCIA DE STOCK) ---
const UMBRAL_STOCK_FOMO = 3; // Dispara el cartel rojo cuando el stock es menor o igual a este número

let productos = [];
let carrito = []; // Estructura: [{ producto, cantidad }]
let cotizacionDolar = 1200;
let categoriaActiva = "Todas";
let productoModalActual = null;

// ==========================================
// FUNCIÓN PARA ACTUALIZAR HTML DINÁMICO
// ==========================================
function configurarInterfaz() {
    const tituloPrincipal = document.getElementById('titulo-principal');
    const bannerPromo = document.getElementById('banner-promocional');
    const textoCant = document.getElementById('texto-cantidad-mayorista');
    
    if (ACTIVAR_MAYORISTA) {
        document.title = "Catálogo Mayorista Premium";
        if (tituloPrincipal) tituloPrincipal.innerText = "CATÁLOGO MAYORISTA";
        if (bannerPromo) bannerPromo.style.display = "block"; 
        if (textoCant) textoCant.innerText = `${CANTIDAD_MINIMA_MAYORISTA} o más unidades`;
    } else {
        document.title = "Catálogo de Productos";
        if (tituloPrincipal) tituloPrincipal.innerText = "CATÁLOGO DE PRODUCTOS";
        if (bannerPromo) bannerPromo.style.display = "none"; 
    }
}

function redondearPrecioPsicologico(valor) {
    if (valor <= 0) return 0;
    return Math.round(valor / 1000) * 1000 - 0.01;
}

// ==========================================
// 1. OBTENER DÓLAR BLUE EN TIEMPO REAL
// ==========================================
async function obtenerDolar() {
    try {
        const res = await fetch('https://dolarapi.com/v1/dolares/blue');
        const data = await res.json();
        if (data && data.venta) cotizacionDolar = data.venta;
    } catch (e) {
        console.log("Usando dólar de respaldo $1200");
    }
}

// ==========================================
// 2. CARGAR Y PROCESAR CSV
// ==========================================
async function CargarCSV() {
    await obtenerDolar();
    
    if (typeof Papa === 'undefined') {
        console.error('PapaParse no está definido. Asegurate de cargar la librería PapaParse antes de app.js');
        return;
    }

    try {
        const respuesta = await fetch(URL_CSV_DIRECTO);
        if (!respuesta.ok) {
            console.error('No se pudo cargar el CSV:', respuesta.status, respuesta.statusText);
            return;
        }
        const textoCSV = await respuesta.text();

        Papa.parse(textoCSV, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                try {
                    // CÓDIGO CORREGIDO (Elimina IDs duplicados automáticamente):
let datosRaw = results.data.filter(p => p && p.nombre && p.id);

// Guardamos solo el primer producto de cada ID
const idsVistos = new Set();
let datos = datosRaw.filter(p => {
    const idLimpio = p.id.toString().trim();
    if (idsVistos.has(idLimpio)) {
        return false; // Descarta si el ID ya fue dibujado
    }
    idsVistos.add(idLimpio);
    return true;
});

                    // ORDENAR POR MAYOR STOCK PRIMERO
                    datos.sort((a, b) => {
                        const obtenerValorStock = (stockTxt) => {
                            const txt = (stockTxt || '').toString().toLowerCase().trim();
                            if (!isNaN(parseInt(txt))) return parseInt(txt); 
                            if (txt === 'si' || txt === 'disponible') return 9999; 
                            return 0; 
                        };
                        return obtenerValorStock(b.stock) - obtenerValorStock(a.stock);
                    });

                    productos = datos;
                    generarBotonesCategorias();
                    filtrarProductos();
                } catch (innerE) {
                    console.error('Error procesando CSV:', innerE);
                }
            }
        });
    } catch (error) {
        console.error("Error al cargar el CSV:", error);
    }
}

// ==========================================
// 3. FILTROS Y CATEGORÍAS
// ==========================================
function generarBotonesCategorias() {
    try {
        const contenedor = document.getElementById('contenedor-categorias');
        if (!contenedor) return;

        const categorias = ["Todas", ...new Set(productos.map(p => p.categoria).filter(Boolean))];

        contenedor.innerHTML = categorias.map(cat => `
            <button onclick="seleccionarCategoria('${cat.replace(/'/g, "\\'")}')" 
                    class="btn-categoria text-xs font-bold px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${cat === categoriaActiva ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                ${cat}
            </button>
        `).join('');
    } catch (e) {
        console.error('Error en generarBotonesCategorias:', e);
    }
}

function seleccionarCategoria(cat) {
    categoriaActiva = cat;
    generarBotonesCategorias();
    filtrarProductos();
}

function filtrarProductos() {
    const texto = (document.getElementById('input-busqueda')?.value || '').toLowerCase().trim();

    const filtrados = productos.filter(p => {
        const coincideCat = categoriaActiva === "Todas" || p.categoria === categoriaActiva;
        const nombre = (p.nombre || '').toString().toLowerCase();
        const coincideNombre = nombre.includes(texto);
        return coincideCat && coincideNombre;
    });

    dibujarProductos(filtrados);
}

// ==========================================
// 4. RENDERIZAR PRODUCTOS EN GRILLA (OPTIMIZADO)
// ==========================================
function dibujarProductos(lista) {
    try {
        const contenedor = document.getElementById('contenedor-productos');
        if (!contenedor) return;

        if (!Array.isArray(lista) || lista.length === 0) {
            contenedor.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400 font-medium">No se encontraron artículos.</div>`;
            return;
        }

        // Se usa .map().join('') para renderizar todo en un solo impacto al DOM
        contenedor.innerHTML = lista.map(prod => {
            const pMinUSD = parseFloat(prod.precio_minorista) || 0;
            const pMayUSD = parseFloat(prod.precio_mayorista) || 0;
            
            const pMinARS = redondearPrecioPsicologico(pMinUSD * cotizacionDolar);
            const pMayARS = redondearPrecioPsicologico(pMayUSD * cotizacionDolar);

            const stockTxt = (prod.stock || '').toString().toLowerCase().trim();
            const esStockNumerico = !isNaN(parseInt(stockTxt));
            const cantidadStock = esStockNumerico ? parseInt(stockTxt) : 0;
            const tieneStock = esStockNumerico ? cantidadStock > 0 : (stockTxt === 'si' || stockTxt === 'disponible');

            const botonHTML = tieneStock 
                ? `<button onclick="event.stopPropagation(); agregarAlCarrito('${prod.id}', 1)" class="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all z-20 relative">Agregar</button>`
                : `<button disabled class="bg-slate-100 text-slate-400 px-3 py-1.5 rounded-xl text-xs font-bold cursor-not-allowed z-20 relative">Agotado</button>`;

            let cartelUrgencia = '';
            if (tieneStock && esStockNumerico && cantidadStock <= UMBRAL_STOCK_FOMO) {
                const textoUrgencia = cantidadStock === 1 ? "¡Última unidad!" : "¡Últimas unidades!";
                cartelUrgencia = `
                    <div class="absolute top-3 right-3 z-20 bg-red-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shadow-md shadow-red-500/30 animate-pulse pointer-events-none">
                        ${textoUrgencia}
                    </div>
                `;
            }

            const arrayImagenes = (prod.imagen || "").split('|').map(u => u.trim());
            const img1 = arrayImagenes[0] || 'https://via.placeholder.com/300';
            const img2 = arrayImagenes.length > 1 ? arrayImagenes[1] : img1;

            let bloquePreciosGrilla = '';
            if (ACTIVAR_MAYORISTA) {
                bloquePreciosGrilla = `
                    <div>
                        <p class="font-black text-emerald-600 text-sm">$${pMayARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="precio-usd-grilla">USD ${pMayUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="text-[10px] line-through text-slate-400 mt-1">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="text-[10px] text-slate-300">USD ${pMinUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                    </div>
                `;
            } else {
                bloquePreciosGrilla = `
                    <div>
                        <p class="font-black text-emerald-600 text-sm">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="precio-usd-grilla">USD ${pMinUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                    </div>
                `;
            }

            return `
                <div onclick="abrirModal('${prod.id}')" class="relative bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between cursor-pointer hover:shadow-md transition-all group overflow-hidden">
                    ${cartelUrgencia}
                    <div>
                        <div class="relative overflow-hidden rounded-xl bg-slate-50 mb-3 h-48 sm:h-56 p-2 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                            <img src="${img2}" class="w-full h-full object-contain max-h-full max-w-full p-2" style="object-fit: contain !important;" onerror="this.src='https://via.placeholder.com/300'">
                            <img src="${img1}" class="absolute inset-0 w-full h-full object-contain max-h-full max-w-full p-2 hover-img bg-slate-50" style="object-fit: contain !important;" onerror="this.src='https://via.placeholder.com/300'">
                        </div>
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">${prod.categoria || 'General'}</span>
                        <h3 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug mb-2 group-hover:text-emerald-600 transition-colors line-clamp-2">${prod.nombre}</h3>
                    </div>
                    <div class="flex justify-between items-end border-t border-slate-100 pt-2.5 mt-2">
                        ${bloquePreciosGrilla}
                        ${botonHTML}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error en dibujarProductos:', e);
    }
}

// ==========================================
// 5. POPUP MODAL
// ==========================================
function abrirModal(id) {
    try {
        const prod = productos.find(p => p.id.toString() === id.toString());
        if (!prod) return;

        productoModalActual = prod;

        const pMinUSD = parseFloat(prod.precio_minorista) || 0;
        const pMayUSD = parseFloat(prod.precio_mayorista) || 0;

        const pMinARS = redondearPrecioPsicologico(pMinUSD * cotizacionDolar);
        const pMayARS = redondearPrecioPsicologico(pMayUSD * cotizacionDolar);

        const stockTxt = (prod.stock || '').toString().toLowerCase().trim();
        const esStockNumerico = !isNaN(parseInt(stockTxt));
        const cantidadStock = esStockNumerico ? parseInt(stockTxt) : 0;
        const tieneStock = esStockNumerico ? cantidadStock > 0 : (stockTxt === 'si' || stockTxt === 'disponible');

        const arrayImagenes = (prod.imagen || "").split('|').map(u => u.trim());
        
        const fotoPrincipal = document.getElementById('modal-imagen');
        if (fotoPrincipal) {
            fotoPrincipal.src = arrayImagenes[0] || 'https://via.placeholder.com/300';
            fotoPrincipal.className = "w-full h-64 sm:h-96 object-contain max-h-[80vh] mx-auto rounded-xl bg-slate-50 p-3 transition-opacity duration-200";
            fotoPrincipal.style.objectFit = "contain";
        }
        
        const galeriaContenedor = document.getElementById('modal-galeria');
        if (galeriaContenedor) galeriaContenedor.innerHTML = ""; 
        
        if (arrayImagenes.length > 1 && galeriaContenedor) {
            galeriaContenedor.classList.remove('hidden');
            arrayImagenes.forEach((imgSrc) => {
                galeriaContenedor.innerHTML += `
                    <button onclick="cambiarFotoModal('${imgSrc}')" class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 border-slate-100 hover:border-slate-900 focus:border-slate-900 transition-all bg-slate-50 p-1">
                        <img src="${imgSrc}" class="w-full h-full object-contain" style="object-fit: contain !important;">
                    </button>
                `;
            });
        } else if (galeriaContenedor) {
            galeriaContenedor.classList.add('hidden'); 
        }

        const modalCategoriaEl = document.getElementById('modal-categoria');
        if (modalCategoriaEl) modalCategoriaEl.innerText = prod.categoria || 'Producto';
        const modalNombreEl = document.getElementById('modal-nombre');
        if (modalNombreEl) modalNombreEl.innerText = prod.nombre;
        
        const elDesc = document.getElementById('modal-descripcion');
        if (elDesc) elDesc.innerText = prod.descripcion || 'Sin descripción disponible.';

        const contenedorPreciosModal = document.getElementById('contenedor-precios-modal');
        if (contenedorPreciosModal) {
            if (ACTIVAR_MAYORISTA) {
                contenedorPreciosModal.classList.add('grid', 'grid-cols-2');
                contenedorPreciosModal.classList.remove('flex', 'justify-center');
                contenedorPreciosModal.innerHTML = `
                    <div class="border-r border-slate-200/60 pr-2">
                        <p class="text-[10px] text-slate-400 font-semibold uppercase">Minorista</p>
                        <p class="text-sm font-bold text-slate-500 line-through">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="precio-usd-modal">USD ${pMinUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                    </div>
                    <div class="pl-2">
                        <p class="text-[10px] text-emerald-600 font-bold uppercase">Mayorista</p>
                        <p class="text-lg font-black text-emerald-600">$${pMayARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="precio-usd-modal">USD ${pMayUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                    </div>
                `;
            } else {
                contenedorPreciosModal.classList.remove('grid', 'grid-cols-2');
                contenedorPreciosModal.classList.add('flex', 'justify-center', 'text-center', 'flex-col');
                contenedorPreciosModal.innerHTML = `
                    <div>
                        <p class="text-[10px] text-emerald-600 font-bold uppercase">Precio Unitario</p>
                        <p class="text-2xl font-black text-emerald-600">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="precio-usd-modal mt-2">USD ${pMinUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                    </div>
                `;
            }
        }

        const inputCant = document.getElementById('modal-cantidad');
        if (inputCant) inputCant.value = 1;

        const badgeContainer = document.getElementById('modal-stock-badge');
        const btnContainer = document.getElementById('modal-btn-container');

        if (tieneStock) {
            if (esStockNumerico && cantidadStock <= UMBRAL_STOCK_FOMO) {
                const textoModalUrgencia = cantidadStock === 1 
                    ? "🔥 ¡Solo queda 1 unidad!" 
                    : `🔥 ¡Solo quedan ${cantidadStock} unidades!`;

                if (badgeContainer) badgeContainer.innerHTML = `
                    <span class="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-red-200 animate-pulse">
                        ${textoModalUrgencia}
                    </span>
                `;
            } else if (badgeContainer) {
                badgeContainer.innerHTML = `<span class="inline-block bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">● En Stock</span>`;
            }
            if (btnContainer) btnContainer.innerHTML = `<button onclick="confirmarAgregarModal()" class="w-full bg-slate-900 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">Agregar al Carrito</button>`;
        } else if (badgeContainer && btnContainer) {
            badgeContainer.innerHTML = `<span class="inline-block bg-red-50 text-red-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-red-200">● Agotado</span>`;
            btnContainer.innerHTML = `<button disabled class="w-full bg-slate-100 text-slate-400 py-2.5 rounded-xl font-bold text-xs cursor-not-allowed">Sin Stock</button>`;
        }

        const modalDetalle = document.getElementById('modal-detalle');
        if (modalDetalle) modalDetalle.classList.remove('hidden');

    } catch (e) {
        console.error('Error en abrirModal:', e);
    }
}

function cambiarFotoModal(url) {
    const fotoPrincipal = document.getElementById('modal-imagen');
    if (!fotoPrincipal) return;
    fotoPrincipal.style.opacity = '0.5'; 
    setTimeout(() => {
        fotoPrincipal.src = url;
        fotoPrincipal.style.opacity = '1';
    }, 150);
}

function cambiarCantidadModal(delta) {
    const inputCant = document.getElementById('modal-cantidad');
    if (!inputCant) return;

    let actual = parseInt(inputCant.value) || 1;
    if (actual + delta >= 1) {
        inputCant.value = actual + delta;
    }
}

function validarCantidadInputModal(input) {
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) {
        input.value = 1;
    }
}

function confirmarAgregarModal() {
    const inputCant = document.getElementById('modal-cantidad');
    const cantidad = parseInt(inputCant?.value) || 1;

    if (productoModalActual) {
        agregarAlCarrito(productoModalActual.id, cantidad);
        cerrarModal();
    }
}

function cerrarModal() {
    const modalDetalle = document.getElementById('modal-detalle');
    if (modalDetalle) modalDetalle.classList.add('hidden');
}

document.getElementById('modal-detalle')?.addEventListener('click', function(e) {
    if (e.target === this) cerrarModal();
});

// ==========================================
// 6. LÓGICA CARRITO Y WHATSAPP
// ==========================================
function agregarAlCarrito(id, cantidad = 1) {
    const prod = productos.find(p => p.id.toString() === id.toString());
    if (!prod) return;

    const itemExistente = carrito.find(item => item.producto.id.toString() === id.toString());

    if (itemExistente) {
        itemExistente.cantidad += cantidad;
    } else {
        carrito.push({ producto: prod, cantidad: cantidad });
    }

    actualizarCarrito();
}

function refreshNavBadge() {
    const badge = document.getElementById('mnav-badge');
    if (!badge) return;
    const totalUnidades = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    if (totalUnidades > 0) {
        badge.innerText = totalUnidades;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function actualizarCarrito() {
    try {
        const lista = document.getElementById('lista-carrito');
        const totalEl = document.getElementById('total-precio');
        const totalMobile = document.getElementById('total-precio-mobile');
        const cantMobile = document.getElementById('cant-items-mobile');
        const badgeTotalItems = document.getElementById('badge-total-items');
        const avisoEl = document.getElementById('aviso-mayorista');
        
        if (!lista) return;
        lista.innerHTML = "";

        const totalUnidades = carrito.reduce((acc, item) => acc + item.cantidad, 0);
        const aplicaMayorista = ACTIVAR_MAYORISTA && (totalUnidades >= CANTIDAD_MINIMA_MAYORISTA);
        let totalARS = 0;
        let totalUSD = 0;

        carrito.forEach((item, idx) => {
            const prod = item.producto;
            const pUSD = aplicaMayorista ? parseFloat(prod.precio_mayorista) : parseFloat(prod.precio_minorista);
            const pARS = redondearPrecioPsicologico(pUSD * cotizacionDolar);
            const subtotal = pARS * item.cantidad;
            const subtotalUSD = pUSD * item.cantidad;
            totalARS += subtotal;
            totalUSD += subtotalUSD;

            lista.innerHTML += `
                <div class="flex items-center justify-between bg-slate-50 p-2 rounded-xl text-xs border border-slate-100">
                    <div class="pr-2 truncate flex-1">
                        <p class="font-bold text-slate-800 truncate">${prod.nombre}</p>
                        <p class="text-[10px] text-slate-400">$${pARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                        <p class="precio-usd-carrito">USD ${pUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})} c/u</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <div class="flex items-center border bg-white rounded-lg px-1">
                            <button onclick="modificarCantidadCarrito(${idx}, -1)" class="px-1 text-slate-500 font-bold">-</button>
                            <span class="px-1.5 font-bold text-slate-900">${item.cantidad}</span>
                            <button onclick="modificarCantidadCarrito(${idx}, 1)" class="px-1 text-slate-500 font-bold">+</button>
                        </div>
                        <button onclick="eliminarDelCarrito(${idx})" class="text-red-500 font-bold hover:text-red-700 text-xs px-1">✕</button>
                    </div>
                </div>
            `;
        });

        if (totalEl) {
            totalEl.innerHTML = `<div class="text-2xl font-black text-slate-900">$${totalARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div><div class="total-usd-desktop mt-1">USD ${totalUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>`;
        }
        
        if (totalMobile) {
            totalMobile.innerHTML = `${totalARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
        }
        
        if (cantMobile) cantMobile.innerText = totalUnidades;
        if (badgeTotalItems) badgeTotalItems.innerText = `${totalUnidades} item${totalUnidades !== 1 ? 's' : ''}`;

        if (avisoEl) {
            if (!ACTIVAR_MAYORISTA) {
                avisoEl.style.display = 'none'; 
            } else {
                avisoEl.style.display = 'block';
                if (aplicaMayorista) {
                    avisoEl.innerText = "¡Precios mayoristas aplicados!";
                    avisoEl.className = "text-xs font-bold text-emerald-700 mb-4 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center";
                } else {
                    const faltantes = CANTIDAD_MINIMA_MAYORISTA - totalUnidades;
                    avisoEl.innerText = `Llevá ${faltantes} un. más para precio mayorista.`;
                    avisoEl.className = "text-xs font-semibold text-amber-800 mb-4 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-center";
                }
            }
        }

        refreshNavBadge();

    } catch (e) {
        console.error('Error en actualizarCarrito:', e);
    }
}

function modificarCantidadCarrito(idx, delta) {
    if (carrito[idx]) {
        carrito[idx].cantidad += delta;
        if (carrito[idx].cantidad <= 0) {
            carrito.splice(idx, 1);
        }
        actualizarCarrito();
    }
}

function eliminarDelCarrito(idx) {
    carrito.splice(idx, 1);
    actualizarCarrito();
}

function enviarWhatsApp() {
    if (carrito.length === 0) return alert("El carrito está vacío");

    const nombre = document.getElementById('cliente-nombre')?.value.trim();
    const direccion = document.getElementById('cliente-direccion')?.value.trim();
    const nota = document.getElementById('cliente-nota')?.value.trim();

    if (!nombre || !direccion) return alert("Por favor, completá Nombre y Dirección.");

    let msj = ACTIVAR_MAYORISTA ? `📦 *NUEVO PEDIDO MAYORISTA*\n\n` : `📦 *NUEVO PEDIDO*\n\n`;
    msj += `👤 *Cliente:* ${nombre}\n📍 *Dirección:* ${direccion}\n`;
    if (nota) msj += `📝 *Nota:* ${nota}\n`;
    msj += `\n--------------------------------\n\n🛒 *Detalle del Pedido:*\n`;

    const totalUnidades = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    const aplicaMayorista = ACTIVAR_MAYORISTA && (totalUnidades >= CANTIDAD_MINIMA_MAYORISTA);
    let totalARS = 0;
    let totalUSD = 0;

    carrito.forEach(item => {
        const prod = item.producto;
        const pUSD = aplicaMayorista ? parseFloat(prod.precio_mayorista) : parseFloat(prod.precio_minorista);
        const pARS = redondearPrecioPsicologico(pUSD * cotizacionDolar);
        const subtotal = pARS * item.cantidad;
        const subtotalUSD = pUSD * item.cantidad;
        totalARS += subtotal;
        totalUSD += subtotalUSD;

        msj += `• ${item.cantidad}x ${prod.nombre}\n   $${subtotal.toLocaleString('es-AR', {minimumFractionDigits: 2})} / USD ${subtotalUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}\n`;
    });

    msj += `\n--------------------------------\n💰 *TOTAL:*\n$${totalARS.toLocaleString('es-AR', {minimumFractionDigits: 2})} ARS\nUSD ${totalUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;

    window.open(`https://wa.me/${MI_NUMERO_WHATSAPP}?text=${encodeURIComponent(msj)}`, '_blank');
}

// ===== Botón Subir al Inicio (versión Web Desktop) =====
function initScrollToTop() {
    const html = `
        <button id="btn-scroll-top" class="fixed bottom-6 right-6 z-40 hidden lg:flex items-center justify-center w-12 h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all opacity-0 hover:scale-110" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })" title="Subir al inicio">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5z"></path></svg>
        </button>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    const btn = document.getElementById('btn-scroll-top');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btn.classList.remove('opacity-0');
            btn.classList.add('opacity-100');
        } else {
            btn.classList.add('opacity-0');
            btn.classList.remove('opacity-100');
        }
    });
}

// ===== Navegación inferior estilo app (Tailwind) =====
function initBottomNav() {
  if (document.getElementById('mnav')) return;

  const html = `
    <nav id="mnav" class="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-t border-slate-200/60">
      <div class="max-w-4xl mx-auto flex justify-between items-center px-2 py-2">
        <button id="mnav-home" class="mnav-item flex flex-col items-center text-slate-600 text-xs px-2 py-1 rounded-md active:scale-95">
          <svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10.5z"/></svg>
          <span class="block text-[10px]">Inicio</span>
        </button>

        <button id="mnav-search" class="mnav-item flex flex-col items-center text-slate-600 text-xs px-2 py-1 rounded-md active:scale-95">
          <svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 20l-5.6-5.6A7 7 0 1 0 9 16a7 7 0 0 0 6.4-3.4L21 20zM11 16a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
          <span class="block text-[10px]">Buscar</span>
        </button>

        <button id="mnav-cats" class="mnav-item flex flex-col items-center text-slate-600 text-xs px-2 py-1 rounded-md active:scale-95">
          <svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm10 8h8v-6h-8v6zM3 21h8v-6H3v6zm10-18v6h8V3h-8z"/></svg>
          <span class="block text-[10px]">Categorías</span>
        </button>

        <button id="mnav-cart" class="mnav-item relative flex flex-col items-center text-slate-600 text-xs px-2 py-1 rounded-md active:scale-95">
          <svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
          <span id="mnav-badge" class="hidden absolute -top-1 right-3 min-w-[18px] text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 leading-none">0</span>
          <span class="block text-[10px]">Carrito</span>
        </button>
      </div>
    </nav>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const btnHome = document.getElementById('mnav-home');
  const btnSearch = document.getElementById('mnav-search');
  const btnCats = document.getElementById('mnav-cats');
  const btnCart = document.getElementById('mnav-cart');

  function clearActive() {
    document.querySelectorAll('#mnav .mnav-item').forEach(el => {
      el.classList.remove('text-white', 'bg-slate-900');
      el.classList.add('text-slate-600');
    });
  }

  function setActive(el) {
    clearActive();
    el.classList.remove('text-slate-600');
    el.classList.add('text-white', 'bg-slate-900');
  }

  btnHome.addEventListener('click', () => {
    setActive(btnHome);
    if (typeof seleccionarCategoria === 'function') seleccionarCategoria('Todas');
    const inp = document.getElementById('input-busqueda');
    if (inp) { inp.value = ''; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  btnSearch.addEventListener('click', () => {
    setActive(btnSearch);
    const inp = document.getElementById('input-busqueda');
    if (inp) {
      inp.focus();
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const cont = document.getElementById('contenedor-categorias');
      if (cont) cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  btnCats.addEventListener('click', () => {
    setActive(btnCats);
    const cont = document.getElementById('contenedor-categorias');
    if (cont) {
      cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cont.style.transition = 'box-shadow 0.35s';
      cont.style.boxShadow = '0 0 0 4px rgba(34,197,94,0.06)';
      setTimeout(() => cont.style.boxShadow = '', 700);
    }
  });

  btnCart.addEventListener('click', () => {
    setActive(btnCart);
    if (typeof actualizarCarrito === 'function') actualizarCarrito();
    const lista = document.getElementById('lista-carrito');
    if (lista) {
      lista.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  });
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    configurarInterfaz();
    CargarCSV();
    initScrollToTop();
    initBottomNav();
});
