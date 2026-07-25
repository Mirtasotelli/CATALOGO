// ==========================================
// CONFIGURACIÓN INICIAL
// ==========================================
const URL_CSV_DIRECTO = "https://raw.githubusercontent.com/tevo-mdp/prueba_caipser/main/productos.csv"; 
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
    
    try {
        const respuesta = await fetch(URL_CSV_DIRECTO);
        const textoCSV = await respuesta.text();

        Papa.parse(textoCSV, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                let datos = results.data.filter(p => p.nombre);

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
    const contenedor = document.getElementById('contenedor-categorias');
    if (!contenedor) return;

    const categorias = ["Todas", ...new Set(productos.map(p => p.categoria).filter(Boolean))];

    contenedor.innerHTML = categorias.map(cat => `
        <button onclick="seleccionarCategoria('${cat}')" 
                class="btn-categoria text-xs font-bold px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${cat === categoriaActiva ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            ${cat}
        </button>
    `).join('');
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
        const coincideNombre = p.nombre.toLowerCase().includes(texto);
        return coincideCat && coincideNombre;
    });

    dibujarProductos(filtrados);
}

// ==========================================
// 4. RENDERIZAR PRODUCTOS EN GRILLA
// ==========================================
function dibujarProductos(lista) {
    const contenedor = document.getElementById('contenedor-productos');
    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (lista.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400 font-medium">No se encontraron artículos.</div>`;
        return;
    }

    lista.forEach(prod => {
        const pMinUSD = parseFloat(prod.precio_minorista) || 0;
        const pMayUSD = parseFloat(prod.precio_mayorista) || 0;
        
        const pMinARS = redondearPrecioPsicologico(pMinUSD * cotizacionDolar);
        const pMayARS = redondearPrecioPsicologico(pMayUSD * cotizacionDolar);

        const stockTxt = (prod.stock || '').toString().toLowerCase().trim();
        const esStockNumerico = !isNaN(parseInt(stockTxt));
        const cantidadStock = esStockNumerico ? parseInt(stockTxt) : 0;
        const tieneStock = esStockNumerico ? cantidadStock > 0 : (stockTxt === 'si' || stockTxt === 'disponible');

        const botonHTML = tieneStock 
            ? `<button onclick="event.stopPropagation(); agregarAlCarrito('${prod.id}', 1)" class="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-transform active:scale-95 z-20 relative">Sumar</button>`
            : `<button disabled class="bg-slate-100 text-slate-400 px-3 py-1.5 rounded-xl text-xs font-bold cursor-not-allowed z-20 relative">Agotado</button>`;

        let cartelUrgencia = '';
        if (tieneStock && esStockNumerico && cantidadStock <= UMBRAL_STOCK_FOMO) {
            // FOMO Dinámico en el Home (Singular vs Plural)
            const textoUrgencia = cantidadStock === 1 ? "¡Última unidad!" : "¡Últimas unidades!";
            cartelUrgencia = `
                <div class="absolute top-2 right-2 z-10 bg-red-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shadow-md shadow-red-500/30 animate-pulse">
                    ${textoUrgencia}
                </div>
            `;
        }

        const arrayImagenes = (prod.imagen || "").split('|').map(u => u.trim());
        const img1 = arrayImagenes[0] || 'https://via.placeholder.com/300';
        const img2 = arrayImagenes.length > 1 ? arrayImagenes[1] : img1;

        const bloquePrecioMayorista = ACTIVAR_MAYORISTA 
            ? `<p class="font-black text-emerald-600 text-sm">$${pMayARS.toLocaleString('es-AR', {minimumFractionDigits: 2})} <span class="text-[9px] font-normal text-slate-400">x mayor</span></p>` 
            : `<p class="font-black text-emerald-600 text-sm">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>`;

        const bloquePrecioMinorista = ACTIVAR_MAYORISTA 
            ? `<p class="text-[10px] line-through text-slate-400">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>` 
            : ``;

        contenedor.innerHTML += `
            <div onclick="abrirModal('${prod.id}')" class="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between cursor-pointer hover:shadow-md hover:border-slate-300 transition-all group relative">
                ${cartelUrgencia}
                <div>
                    <div class="relative overflow-hidden rounded-xl bg-slate-50 mb-3 h-36 sm:h-44 group-hover:scale-105 transition-transform duration-300">
                        <img src="${img2}" class="absolute inset-0 w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/300'">
                        <img src="${img1}" class="absolute inset-0 w-full h-full object-cover hover-img bg-slate-50" onerror="this.src='https://via.placeholder.com/300'">
                    </div>
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">${prod.categoria || 'General'}</span>
                    <h3 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug mb-2 group-hover:text-emerald-600 transition-colors line-clamp-2">${prod.nombre}</h3>
                </div>
                <div class="flex justify-between items-end border-t border-slate-100 pt-2.5 mt-2">
                    <div>
                        ${bloquePrecioMinorista}
                        ${bloquePrecioMayorista}
                    </div>
                    ${botonHTML}
                </div>
            </div>
        `;
    });
}

// ==========================================
// 5. POPUP MODAL
// ==========================================
function abrirModal(id) {
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
    fotoPrincipal.src = arrayImagenes[0] || 'https://via.placeholder.com/300';
    
    const galeriaContenedor = document.getElementById('modal-galeria');
    galeriaContenedor.innerHTML = ""; 
    
    if (arrayImagenes.length > 1) {
        galeriaContenedor.classList.remove('hidden');
        arrayImagenes.forEach((imgSrc) => {
            galeriaContenedor.innerHTML += `
                <button onclick="cambiarFotoModal('${imgSrc}')" class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-slate-900 focus:border-slate-900 transition-all bg-slate-100">
                    <img src="${imgSrc}" class="w-full h-full object-cover">
                </button>
            `;
        });
    } else {
        galeriaContenedor.classList.add('hidden'); 
    }

    document.getElementById('modal-categoria').innerText = prod.categoria || 'Producto';
    document.getElementById('modal-nombre').innerText = prod.nombre;
    
    const elDesc = document.getElementById('modal-descripcion');
    if (elDesc) elDesc.innerText = prod.descripcion || 'Sin descripción disponible.';

    const contenedorPreciosModal = document.getElementById('contenedor-precios-modal');
    if (ACTIVAR_MAYORISTA) {
        contenedorPreciosModal.classList.add('grid', 'grid-cols-2');
        contenedorPreciosModal.classList.remove('flex', 'justify-center');
        contenedorPreciosModal.innerHTML = `
            <div class="border-r border-slate-200/60 pr-2">
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Minorista</p>
                <p id="modal-precio-min" class="text-sm font-bold text-slate-500 line-through">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
            </div>
            <div class="pl-2">
                <p class="text-[10px] text-emerald-600 font-bold uppercase">Mayorista</p>
                <p id="modal-precio-may" class="text-lg font-black text-emerald-600">$${pMayARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
            </div>
        `;
    } else {
        contenedorPreciosModal.classList.remove('grid', 'grid-cols-2');
        contenedorPreciosModal.classList.add('flex', 'justify-center', 'text-center');
        contenedorPreciosModal.innerHTML = `
            <div>
                <p class="text-[10px] text-emerald-600 font-bold uppercase">Precio Unitario</p>
                <p id="modal-precio-may" class="text-2xl font-black text-emerald-600">$${pMinARS.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
            </div>
        `;
    }

    const inputCant = document.getElementById('modal-cantidad');
    if (inputCant) inputCant.value = 1;

    const badgeContainer = document.getElementById('modal-stock-badge');
    const btnContainer = document.getElementById('modal-btn-container');

    if (tieneStock) {
        // FOMO Dinámico en el Modal (Singular vs Plural)
        if (esStockNumerico && cantidadStock <= UMBRAL_STOCK_FOMO) {
            const textoModalUrgencia = cantidadStock === 1 
                ? "🔥 ¡Solo queda 1 unidad!" 
                : `🔥 ¡Solo quedan ${cantidadStock} unidades!`;

            badgeContainer.innerHTML = `
                <span class="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-red-200 animate-pulse">
                    ${textoModalUrgencia}
                </span>
            `;
        } else {
            badgeContainer.innerHTML = `<span class="inline-block bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">● En Stock</span>`;
        }
        btnContainer.innerHTML = `<button onclick="confirmarAgregarModal()" class="w-full bg-slate-900 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all active:scale-95 shadow-sm">Agregar al Pedido</button>`;
    } else {
        badgeContainer.innerHTML = `<span class="inline-block bg-red-50 text-red-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-red-200">● Agotado</span>`;
        btnContainer.innerHTML = `<button disabled class="w-full bg-slate-100 text-slate-400 py-2.5 rounded-xl font-bold text-xs cursor-not-allowed">Sin Stock</button>`;
    }

    document.getElementById('modal-detalle').classList.remove('hidden');
}

function cambiarFotoModal(url) {
    const fotoPrincipal = document.getElementById('modal-imagen');
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
    document.getElementById('modal-detalle').classList.add('hidden');
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

function actualizarCarrito() {
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

    carrito.forEach((item, idx) => {
        const prod = item.producto;
        const pUSD = aplicaMayorista ? parseFloat(prod.precio_mayorista) : parseFloat(prod.precio_minorista);
        const pARS = redondearPrecioPsicologico(pUSD * cotizacionDolar);
        const subtotal = pARS * item.cantidad;
        totalARS += subtotal;

        lista.innerHTML += `
            <div class="flex items-center justify-between bg-slate-50 p-2 rounded-xl text-xs border border-slate-100">
                <div class="pr-2 truncate">
                    <p class="font-bold text-slate-800 truncate">${prod.nombre}</p>
                    <p class="text-[10px] text-slate-400">$${pARS.toLocaleString('es-AR', {minimumFractionDigits: 2})} c/u</p>
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

    if (totalEl) totalEl.innerText = totalARS.toLocaleString('es-AR', {minimumFractionDigits: 2});
    if (totalMobile) totalMobile.innerText = totalARS.toLocaleString('es-AR', {minimumFractionDigits: 2});
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

    carrito.forEach(item => {
        const prod = item.producto;
        const pUSD = aplicaMayorista ? parseFloat(prod.precio_mayorista) : parseFloat(prod.precio_minorista);
        const pARS = redondearPrecioPsicologico(pUSD * cotizacionDolar);
        const subtotal = pARS * item.cantidad;
        totalARS += subtotal;

        msj += `• ${item.cantidad}x ${prod.nombre} - *$${subtotal.toLocaleString('es-AR', {minimumFractionDigits: 2})}*\n`;
    });

    msj += `\n--------------------------------\n💰 *TOTAL ESTIMADO: $${totalARS.toLocaleString('es-AR', {minimumFractionDigits: 2})} ARS*`;

    window.open(`https://wa.me/${MI_NUMERO_WHATSAPP}?text=${encodeURIComponent(msj)}`, '_blank');
}

// Iniciar app al cargar la página configurando todo primero
document.addEventListener('DOMContentLoaded', () => {
    configurarInterfaz();
    CargarCSV();
});
