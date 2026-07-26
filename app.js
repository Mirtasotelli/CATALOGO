// CONFIGURACIÓN DE TU PLANILLA Y TIENDA
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3M1jQz-q9C42OQls4C3k5M-R3_a97A_xXvI4I70e5d0a6w-9p4e8w-4/pub?output=csv'; // Reemplazar si cambia
const WHATSAPP_NUMERO = '5491112345678'; 
const DEBOUNCE_DELAY = 300; 

// ESTADO GLOBAL
let CONFIG = {
    USAR_DOLAR: true,
    CANTIDAD_MINIMA_MAYORISTA: 5,
    PERMITIR_MEZCLAR_PRODUCTOS: true,
    TITULO_CATALOGO: 'MI TIENDA'
};

let COTIZACION_DOLAR = 1;
let productos = [];
let carrito = [];
let categoriaActiva = 'Todos';
let busquedaActual = '';
let productoModalActual = null;
let debounceTimer = null;

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', async () => {
    inicializarBusqueda();
    await obtenerDolarBlue();
    await cargarProductos();
});

// COTIZACIÓN DÓLAR BLUE
async function obtenerDolarBlue() {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares/blue');
        if (!response.ok) throw new Error('Error al consultar la API del dólar');
        const data = await response.json();
        if (data && data.venta) {
            COTIZACION_DOLAR = parseFloat(data.venta);
        }
    } catch (error) {
        console.warn('No se pudo obtener el dólar Blue en vivo. Usando valor por defecto 1.', error);
        COTIZACION_DOLAR = 1;
    }
}

// LECTURA DE CSV
async function cargarProductos() {
    const contenedor = document.getElementById('contenedor-productos');
    try {
        const response = await fetch(`${CSV_URL}&t=${Date.now()}`);
        if (!response.ok) throw new Error('No se pudo cargar el archivo CSV');
        
        const textData = await response.text();

        Papa.parse(textData, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                procesarDatosCSV(results.data);
            },
            error: (err) => {
                throw new Error('Error al parsear el CSV: ' + err.message);
            }
        });
    } catch (error) {
        console.error(error);
        if (contenedor) {
            contenedor.innerHTML = `
                <div class="col-span-full py-12 text-center text-red-500 font-medium">
                    ❌ Ocurrió un error al cargar los productos. Revisa la URL del CSV o tu conexión.
                </div>
            `;
        }
    }
}

// PROCESAMIENTO Y CONFIGURACIÓN
function procesarDatosCSV(data) {
    if (!data || data.length === 0) return;

    const filaConfig = data.find(row => row.ID && row.ID.trim().toUpperCase() === 'CONFIG');
    if (filaConfig) {
        CONFIG.USAR_DOLAR = (filaConfig.USD || '').trim().toUpperCase() === 'SI';
        CONFIG.CANTIDAD_MINIMA_MAYORISTA = parseInt(filaConfig.CANT_MAYORISTA) || 5;
        CONFIG.PERMITIR_MEZCLAR_PRODUCTOS = (filaConfig.MEZCLAR || '').trim().toUpperCase() === 'SI';
        if (filaConfig.Nombre) CONFIG.TITULO_CATALOGO = filaConfig.Nombre.trim();
    }

    actualizarInterfazConfig();

    productos = data
        .filter(row => row.ID && row.ID.trim().toUpperCase() !== 'CONFIG' && row.Nombre)
        .map(row => {
            // Procesar Múltiples Imágenes (Separa por comas)
            let imagenes = [];
            if (row.Imagen && row.Imagen.trim()) {
                imagenes = row.Imagen.split(',').map(url => url.trim()).filter(url => url.length > 0);
            }
            if (imagenes.length === 0) {
                imagenes = ['https://via.placeholder.com/400x400?text=Sin+Imagen'];
            }

            return {
                id: row.ID.trim(),
                nombre: row.Nombre.trim(),
                categoria: row.Categoria ? row.Categoria.trim() : 'General',
                descripcion: row.Descripcion ? row.Descripcion.trim() : '',
                precioMin: parseFloat(row.Precio_Minorista) || 0,
                precioMay: parseFloat(row.Precio_Mayorista) || 0,
                stock: parseInt(row.Stock) || 0,
                imagenes: imagenes
            };
        });

    renderizarCategorias();
    renderizarProductos();
    actualizarCarritoUI();
}

function actualizarInterfazConfig() {
    const elTitulo = document.getElementById('titulo-principal');
    if (elTitulo) elTitulo.innerText = CONFIG.TITULO_CATALOGO;

    const elBanner = document.getElementById('banner-promocional');
    const elTextoMay = document.getElementById('texto-cantidad-mayorista');
    
    if (CONFIG.PERMITIR_MEZCLAR_PRODUCTOS) {
        if (elBanner) elBanner.classList.remove('hidden');
        if (elTextoMay) elTextoMay.innerText = `${CONFIG.CANTIDAD_MINIMA_MAYORISTA} o más unidades`;
    } else {
        if (elBanner) elBanner.classList.add('hidden');
    }
}

// BÚSQUEDA Y FILTROS CON DEBOUNCE
function inicializarBusqueda() {
    const inputBusqueda = document.getElementById('input-busqueda');
    if (inputBusqueda) {
        inputBusqueda.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                busquedaActual = e.target.value.toLowerCase().trim();
                renderizarProductos();
            }, DEBOUNCE_DELAY);
        });
    }
}

function renderizarCategorias() {
    const contenedor = document.getElementById('contenedor-categorias');
    if (!contenedor) return;

    const categoriasUnicas = ['Todos', ...new Set(productos.map(p => p.categoria))];

    contenedor.innerHTML = categoriasUnicas.map(cat => {
        const activa = cat === categoriaActiva;
        return `
            <button 
                onclick="seleccionarCategoria('${cat}')"
                class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    activa 
                    ? 'bg-slate-900 text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }"
            >
                ${cat}
            </button>
        `;
    }).join('');
}

function seleccionarCategoria(cat) {
    categoriaActiva = cat;
    renderizarCategorias();
    renderizarProductos();
}

// RENDERIZADO DE PRODUCTOS (CARRUSEL EN CADA TARJETA)
function renderizarProductos() {
    const contenedor = document.getElementById('contenedor-productos');
    if (!contenedor) return;

    const productosFiltrados = productos.filter(p => {
        const coincideCat = categoriaActiva === 'Todos' || p.categoria === categoriaActiva;
        const coincideBusqueda = p.nombre.toLowerCase().includes(busquedaActual) || 
                                 p.descripcion.toLowerCase().includes(busquedaActual);
        return coincideCat && coincideBusqueda;
    });

    if (productosFiltrados.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-16 text-center text-slate-400 font-medium">
                🔍 No se encontraron productos que coincidan.
            </div>
        `;
        return;
    }

    contenedor.innerHTML = productosFiltrados.map(prod => {
        const sinStock = prod.stock <= 0;
        const pMinARS = CONFIG.USAR_DOLAR ? prod.precioMin * COTIZACION_DOLAR : prod.precioMin;
        const pMayARS = CONFIG.USAR_DOLAR ? prod.precioMay * COTIZACION_DOLAR : prod.precioMay;
        const tieneVariasImagenes = prod.imagenes.length > 1;

        // Generar las imágenes del carrusel para la tarjeta
        const fotosHTML = prod.imagenes.map((img, idx) => `
            <div class="slider-item w-full h-full flex items-center justify-center p-2">
                <img src="${img}" alt="${prod.nombre}" loading="lazy" class="max-h-full max-w-full object-contain">
            </div>
        `).join('');

        // Puntitos indicadores
        const puntosHTML = tieneVariasImagenes ? `
            <div id="dots-${prod.id}" class="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10 pointer-events-none">
                ${prod.imagenes.map((_, idx) => `
                    <span class="dot-item w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-slate-900' : 'bg-slate-300'} transition-all"></span>
                `).join('')}
            </div>
        ` : '';

        // Botones Anterior / Siguiente para PC
        const controlesPC = tieneVariasImagenes ? `
            <button onclick="moverCarrusel('${prod.id}', -1, event)" class="hidden group-hover:flex absolute left-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 w-6 h-6 rounded-full items-center justify-center shadow-md z-10 text-xs font-black transition-all">‹</button>
            <button onclick="moverCarrusel('${prod.id}', 1, event)" class="hidden group-hover:flex absolute right-1 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 w-6 h-6 rounded-full items-center justify-center shadow-md z-10 text-xs font-black transition-all">›</button>
        ` : '';

        return `
            <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden relative group ${sinStock ? 'opacity-65' : ''}">
                
                <!-- BADGES -->
                <div class="absolute top-2.5 left-2.5 z-20 flex flex-col gap-1 items-start">
                    <span class="bg-slate-900/80 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ${prod.categoria}
                    </span>
                    ${sinStock ? '<span class="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">Agotado</span>' : ''}
                </div>

                <!-- CONTENEDOR FOTOGRÁFICO / CARRUSEL -->
                <div class="relative bg-slate-50 h-44 sm:h-52 w-full overflow-hidden cursor-pointer" onclick="abrirModal('${prod.id}')">
                    <div id="slider-${prod.id}" onscroll="actualizarPuntosCarrusel('${prod.id}')" class="slider-container w-full h-full flex overflow-x-auto no-scrollbar">
                        ${fotosHTML}
                    </div>
                    ${puntosHTML}
                    ${controlesPC}
                </div>

                <!-- DETALLES -->
                <div class="p-3.5 sm:p-4 flex flex-col flex-grow justify-between">
                    <div>
                        <h3 onclick="abrirModal('${prod.id}')" class="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 hover:text-blue-600 cursor-pointer transition-colors mb-2">
                            ${prod.nombre}
                        </h3>
                    </div>

                    <div class="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-2">
                        <div>
                            <div class="flex items-baseline justify-between">
                                <span class="text-[10px] text-slate-400 font-bold uppercase">Minorista</span>
                                <span class="text-xs sm:text-sm font-black text-slate-900">$${Math.round(pMinARS).toLocaleString('es-AR')}</span>
                            </div>
                            ${CONFIG.USAR_DOLAR ? `<div class="text-right precio-usd-grilla">USD ${prod.precioMin.toFixed(2)}</div>` : ''}
                            
                            ${prod.precioMay > 0 ? `
                                <div class="flex items-baseline justify-between mt-1 text-emerald-600">
                                    <span class="text-[10px] font-bold uppercase">Mayorista</span>
                                    <span class="text-xs sm:text-sm font-black">$${Math.round(pMayARS).toLocaleString('es-AR')}</span>
                                </div>
                                ${CONFIG.USAR_DOLAR ? `<div class="text-right text-[10px] sm:text-xs font-bold text-emerald-600">USD ${prod.precioMay.toFixed(2)}</div>` : ''}
                            ` : ''}
                        </div>

                        <div class="flex gap-1.5 mt-1">
                            <button 
                                onclick="abrirModal('${prod.id}')"
                                class="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                                title="Ver detalle"
                            >
                                👁️
                            </button>
                            <button 
                                onclick="agregarAlCarrito('${prod.id}', 1)"
                                ${sinStock ? 'disabled' : ''}
                                class="w-2/3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                            >
                                ${sinStock ? 'Sin stock' : '+ Agregar'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }).join('');
}

// LOGICA DE DESPLAZAMIENTO DEL CARRUSEL EN GRILLA
function moverCarrusel(prodId, direccion, event) {
    if(event) event.stopPropagation();
    const slider = document.getElementById(`slider-${prodId}`);
    if (!slider) return;
    const anchoItem = slider.clientWidth;
    slider.scrollBy({ left: direccion * anchoItem, behavior: 'smooth' });
}

function actualizarPuntosCarrusel(prodId) {
    const slider = document.getElementById(`slider-${prodId}`);
    const contenedorPuntos = document.getElementById(`dots-${prodId}`);
    if (!slider || !contenedorPuntos) return;

    const indiceActual = Math.round(slider.scrollLeft / slider.clientWidth);
    const puntos = contenedorPuntos.querySelectorAll('.dot-item');
    
    puntos.forEach((dot, idx) => {
        if (idx === indiceActual) {
            dot.classList.remove('bg-slate-300');
            dot.classList.add('bg-slate-900');
        } else {
            dot.classList.remove('bg-slate-900');
            dot.classList.add('bg-slate-300');
        }
    });
}

// LOGICA DEL CARRITO
function agregarAlCarrito(prodId, cantidad = 1) {
    const prod = productos.find(p => p.id === prodId);
    if (!prod || prod.stock <= 0) return;

    const itemEnCarrito = carrito.find(item => item.id === prodId);
    const cantidadActual = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    const nuevaCantidad = cantidadActual + cantidad;

    if (nuevaCantidad > prod.stock) {
        alert(`Stock máximo disponible para ${prod.nombre}: ${prod.stock} unidades.`);
        return;
    }

    if (itemEnCarrito) {
        itemEnCarrito.cantidad = nuevaCantidad;
    } else {
        carrito.push({ id: prodId, cantidad: cantidad });
    }

    actualizarCarritoUI();
}

function cambiarCantidadCarrito(prodId, cambio) {
    const item = carrito.find(i => i.id === prodId);
    if (!item) return;

    const prod = productos.find(p => p.id === prodId);
    const nuevaCant = item.cantidad + cambio;

    if (nuevaCant <= 0) {
        carrito = carrito.filter(i => i.id !== prodId);
    } else if (prod && nuevaCant > prod.stock) {
        alert(`Stock máximo disponible: ${prod.stock}`);
        return;
    } else {
        item.cantidad = nuevaCant;
    }

    actualizarCarritoUI();
}

function calcularTotales() {
    let totalUnidadesGeneral = 0;
    let totalARS = 0;
    let totalUSD = 0;

    carrito.forEach(item => {
        totalUnidadesGeneral += item.cantidad;
    });

    carrito.forEach(item => {
        const prod = productos.find(p => p.id === item.id);
        if (!prod) return;

        let esMayorista = false;
        if (CONFIG.PERMITIR_MEZCLAR_PRODUCTOS) {
            esMayorista = totalUnidadesGeneral >= CONFIG.CANTIDAD_MINIMA_MAYORISTA;
        } else {
            esMayorista = item.cantidad >= CONFIG.CANTIDAD_MINIMA_MAYORISTA;
        }

        const precioAplicadoUSD = (esMayorista && prod.precioMay > 0) ? prod.precioMay : prod.precioMin;
        const precioAplicadoARS = CONFIG.USAR_DOLAR 
            ? precioAplicadoUSD * COTIZACION_DOLAR 
            : (esMayorista && prod.precioMay > 0 ? prod.precioMay : prod.precioMin);

        totalUSD += precioAplicadoUSD * item.cantidad;
        totalARS += precioAplicadoARS * item.cantidad;
    });

    return { totalUnidadesGeneral, totalARS, totalUSD };
}

function actualizarCarritoUI() {
    const listaHtml = document.getElementById('lista-carrito');
    const badgeTotal = document.getElementById('badge-total-items');
    const totalPrecio = document.getElementById('total-precio');
    const avisoMayorista = document.getElementById('aviso-mayorista');
    
    // Elementos flotantes de versión móvil
    const cantMobile = document.getElementById('cant-items-mobile');
    const totalMobile = document.getElementById('total-precio-mobile');

    const { totalUnidadesGeneral, totalARS, totalUSD } = calcularTotales();

    if (badgeTotal) badgeTotal.innerText = `${totalUnidadesGeneral} items`;
    if (cantMobile) cantMobile.innerText = totalUnidadesGeneral;
    if (totalMobile) totalMobile.innerText = Math.round(totalARS).toLocaleString('es-AR');

    if (avisoMayorista) {
        if (CONFIG.PERMITIR_MEZCLAR_PRODUCTOS) {
            const faltantes = CONFIG.CANTIDAD_MINIMA_MAYORISTA - totalUnidadesGeneral;
            if (faltantes > 0) {
                avisoMayorista.className = "text-xs font-semibold text-amber-800 mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200/80 text-center";
                avisoMayorista.innerHTML = `Agregá <strong>${faltantes}</strong> unidad(es) más para precio mayorista.`;
            } else {
                avisoMayorista.className = "text-xs font-semibold text-emerald-800 mb-4 bg-emerald-50 p-3 rounded-xl border border-emerald-200/80 text-center";
                avisoMayorista.innerHTML = `🎉 ¡Genial! Tenés precio mayorista aplicado.`;
            }
        } else {
            avisoMayorista.className = "text-xs font-semibold text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center";
            avisoMayorista.innerText = `Llevando ${CONFIG.CANTIDAD_MINIMA_MAYORISTA}+ de un mismo producto aplica precio mayorista.`;
        }
    }

    if (!listaHtml) return;

    if (carrito.length === 0) {
        listaHtml.innerHTML = `
            <div class="py-8 text-center text-xs font-medium text-slate-400">
                El carrito está vacío
            </div>
        `;
        if (totalPrecio) {
            totalPrecio.innerHTML = `
                <div class="text-2xl font-black text-slate-900">$0</div>
                ${CONFIG.USAR_DOLAR ? `<div class="total-usd-desktop">USD 0.00</div>` : ''}
            `;
        }
        return;
    }

    listaHtml.innerHTML = carrito.map(item => {
        const prod = productos.find(p => p.id === item.id);
        if (!prod) return '';

        let esMayorista = CONFIG.PERMITIR_MEZCLAR_PRODUCTOS 
            ? totalUnidadesGeneral >= CONFIG.CANTIDAD_MINIMA_MAYORISTA 
            : item.cantidad >= CONFIG.CANTIDAD_MINIMA_MAYORISTA;

        const precioUSD = (esMayorista && prod.precioMay > 0) ? prod.precioMay : prod.precioMin;
        const precioARS = CONFIG.USAR_DOLAR ? precioUSD * COTIZACION_DOLAR : precioUSD;
        const subtotalARS = precioARS * item.cantidad;
        const subtotalUSD = precioUSD * item.cantidad;

        return `
            <div class="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                <img src="${prod.imagenes[0]}" alt="${prod.nombre}" class="w-10 h-10 object-contain rounded-lg bg-white p-1 flex-shrink-0">
                <div class="flex-grow min-w-0">
                    <h4 class="text-xs font-bold text-slate-800 truncate">${prod.nombre}</h4>
                    <div class="text-[10px] text-slate-500">
                        $${Math.round(precioARS).toLocaleString('es-AR')} c/u
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="cambiarCantidadCarrito('${item.id}', -1)" class="w-6 h-6 flex items-center justify-center bg-white border rounded text-xs font-bold text-slate-600 hover:bg-slate-100">-</button>
                    <span class="text-xs font-bold w-5 text-center">${item.cantidad}</span>
                    <button onclick="cambiarCantidadCarrito('${item.id}', 1)" class="w-6 h-6 flex items-center justify-center bg-white border rounded text-xs font-bold text-slate-600 hover:bg-slate-100">+</button>
                </div>
                <div class="text-right flex-shrink-0 min-w-[60px]">
                    <div class="text-xs font-black text-slate-900">$${Math.round(subtotalARS).toLocaleString('es-AR')}</div>
                    ${CONFIG.USAR_DOLAR ? `<div class="precio-usd-carrito">USD ${subtotalUSD.toFixed(2)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    if (totalPrecio) {
        totalPrecio.innerHTML = `
            <div class="text-2xl font-black text-slate-900">$${Math.round(totalARS).toLocaleString('es-AR')}</div>
            ${CONFIG.USAR_DOLAR ? `<div class="total-usd-desktop">USD ${totalUSD.toFixed(2)}</div>` : ''}
        `;
    }
}

// MODAL Y GALERÍA
function abrirModal(prodId) {
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return;

    productoModalActual = prod;

    const modal = document.getElementById('modal-detalle');
    const elNombre = document.getElementById('modal-nombre');
    const elCategoria = document.getElementById('modal-categoria');
    const elDescripcion = document.getElementById('modal-descripcion');
    const elStockBadge = document.getElementById('modal-stock-badge');
    const elImagen = document.getElementById('modal-imagen');
    const elGaleria = document.getElementById('modal-galeria');
    const elCantidad = document.getElementById('modal-cantidad');
    const elBtnContainer = document.getElementById('modal-btn-container');

    if (elNombre) elNombre.innerText = prod.nombre;
    if (elCategoria) elCategoria.innerText = prod.categoria;
    if (elDescripcion) elDescripcion.innerText = prod.descripcion || 'Sin descripción disponible.';
    if (elCantidad) elCantidad.value = 1;

    if (elStockBadge) {
        if (prod.stock > 0) {
            elStockBadge.innerHTML = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">En Stock (${prod.stock} un.)</span>`;
        } else {
            elStockBadge.innerHTML = `<span class="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Sin Stock</span>`;
        }
    }

    if (elImagen) {
        elImagen.src = prod.imagenes[0];
        elImagen.alt = prod.nombre;
    }

    if (elGaleria) {
        if (prod.imagenes.length > 1) {
            elGaleria.classList.remove('hidden');
            elGaleria.innerHTML = prod.imagenes.map((imgUrl, index) => `
                <img 
                    src="${imgUrl}" 
                    alt="Vista ${index + 1}" 
                    onclick="cambiarImagenModal('${imgUrl}', this)"
                    class="w-12 h-12 object-contain bg-slate-50 border-2 ${index === 0 ? 'border-slate-900' : 'border-slate-200'} rounded-lg cursor-pointer hover:opacity-80 transition-all flex-shrink-0"
                >
            `).join('');
        } else {
            elGaleria.classList.add('hidden');
            elGaleria.innerHTML = '';
        }
    }

    actualizarPreciosModal();

    if (elBtnContainer) {
        const sinStock = prod.stock <= 0;
        elBtnContainer.innerHTML = `
            <button 
                onclick="agregarDesdeModal('${prod.id}')"
                ${sinStock ? 'disabled' : ''}
                class="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
            >
                ${sinStock ? 'Sin stock' : 'Agregar al carrito'}
            </button>
        `;
    }

    if (modal) modal.classList.remove('hidden');
}

function cambiarImagenModal(url, elemento) {
    const elImagen = document.getElementById('modal-imagen');
    if (elImagen) elImagen.src = url;

    const miniaturas = document.querySelectorAll('#modal-galeria img');
    miniaturas.forEach(img => {
        img.classList.remove('border-slate-900');
        img.classList.add('border-slate-200');
    });

    if (elemento) {
        elemento.classList.remove('border-slate-200');
        elemento.classList.add('border-slate-900');
    }
}

function actualizarPreciosModal() {
    if (!productoModalActual) return;
    const prod = productoModalActual;
    const elContenedorPrecios = document.getElementById('contenedor-precios-modal');
    if (!elContenedorPrecios) return;

    const { totalUnidadesGeneral } = calcularTotales();
    const itemEnCarrito = carrito.find(i => i.id === prod.id);
    const cantEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    
    const inputCant = document.getElementById('modal-cantidad');
    const cantModalInput = inputCant ? parseInt(inputCant.value) || 1 : 1;

    let esMayorista = false;
    if (CONFIG.PERMITIR_MEZCLAR_PRODUCTOS) {
        const totalSimulado = (totalUnidadesGeneral - cantEnCarrito) + cantModalInput;
        esMayorista = totalSimulado >= CONFIG.CANTIDAD_MINIMA_MAYORISTA;
    } else {
        esMayorista = cantModalInput >= CONFIG.CANTIDAD_MINIMA_MAYORISTA;
    }

    const pMinARS = CONFIG.USAR_DOLAR ? prod.precioMin * COTIZACION_DOLAR : prod.precioMin;
    const pMayARS = CONFIG.USAR_DOLAR ? prod.precioMay * COTIZACION_DOLAR : prod.precioMay;

    elContenedorPrecios.innerHTML = `
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 mb-4 space-y-2">
            <div class="flex justify-between items-center ${!esMayorista ? 'font-black text-slate-900' : 'text-slate-500'} text-xs">
                <span>Precio Minorista</span>
                <div class="text-right">
                    <div>$${Math.round(pMinARS).toLocaleString('es-AR')}</div>
                    ${CONFIG.USAR_DOLAR ? `<div class="precio-usd-modal">USD ${prod.precioMin.toFixed(2)}</div>` : ''}
                </div>
            </div>

            ${prod.precioMay > 0 ? `
                <div class="flex justify-between items-center ${esMayorista ? 'font-black text-emerald-600' : 'text-slate-400'} text-xs border-t border-slate-200/60 pt-2">
                    <span class="flex items-center gap-1">
                        Precio Mayorista 
                        ${esMayorista ? '<span class="bg-emerald-500 text-white text-[9px] px-1.5 py-0.2 rounded-full">Aplicado</span>' : ''}
                    </span>
                    <div class="text-right">
                        <div>$${Math.round(pMayARS).toLocaleString('es-AR')}</div>
                        ${CONFIG.USAR_DOLAR ? `<div class="precio-usd-modal ${esMayorista ? 'text-emerald-600' : 'text-slate-400'}">USD ${prod.precioMay.toFixed(2)}</div>` : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function cambiarCantidadModal(delta) {
    const input = document.getElementById('modal-cantidad');
    if (!input || !productoModalActual) return;

    let valor = (parseInt(input.value) || 1) + delta;
    if (valor < 1) valor = 1;
    if (valor > productoModalActual.stock) {
        valor = productoModalActual.stock;
        alert(`Stock máximo disponible: ${productoModalActual.stock}`);
    }

    input.value = valor;
    actualizarPreciosModal();
}

function validarCantidadInputModal(input) {
    if (!productoModalActual) return;
    let val = parseInt(input.value) || 1;
    if (val < 1) val = 1;
    if (val > productoModalActual.stock) {
        val = productoModalActual.stock;
        alert(`Stock disponible superado. Ajustado al máximo (${productoModalActual.stock}).`);
    }
    input.value = val;
    actualizarPreciosModal();
}

function agregarDesdeModal(prodId) {
    const input = document.getElementById('modal-cantidad');
    const cantidad = input ? parseInt(input.value) || 1 : 1;
    agregarAlCarrito(prodId, cantidad);
    cerrarModal();
}

function cerrarModal() {
    const modal = document.getElementById('modal-detalle');
    if (modal) modal.classList.add('hidden');
    productoModalActual = null;
}

// ENVÍO DE PEDIDO A WHATSAPP
function enviarWhatsApp() {
    if (carrito.length === 0) {
        alert('Tu carrito está vacío.');
        return;
    }

    const elNombre = document.getElementById('cliente-nombre');
    const elDireccion = document.getElementById('cliente-direccion');
    const elNota = document.getElementById('cliente-nota');

    const nombre = elNombre ? elNombre.value.trim() : '';
    const direccion = elDireccion ? elDireccion.value.trim() : '';
    const nota = elNota ? elNota.value.trim() : '';

    if (!nombre || !direccion) {
        alert('Por favor completa tu Nombre y Dirección antes de enviar el pedido.');
        return;
    }

    const { totalUnidadesGeneral, totalARS, totalUSD } = calcularTotales();

    let msj = `*¡Hola! Quisiera realizar el siguiente pedido:*\n\n`;
    msj += `👤 *Cliente:* ${nombre}\n`;
    msj += `📍 *Dirección:* ${direccion}\n`;
    if (nota) msj += `📝 *Nota:* ${nota}\n`;
    msj += `\n--- *DETALLE DEL PEDIDO* ---\n\n`;

    carrito.forEach(item => {
        const prod = productos.find(p => p.id === item.id);
        if (!prod) return;

        let esMayorista = CONFIG.PERMITIR_MEZCLAR_PRODUCTOS 
            ? totalUnidadesGeneral >= CONFIG.CANTIDAD_MINIMA_MAYORISTA 
            : item.cantidad >= CONFIG.CANTIDAD_MINIMA_MAYORISTA;

        const pUSD = (esMayorista && prod.precioMay > 0) ? prod.precioMay : prod.precioMin;
        const pARS = CONFIG.USAR_DOLAR ? pUSD * COTIZACION_DOLAR : pUSD;
        const subARS = pARS * item.cantidad;

        msj += `• *${prod.nombre}*\n`;
        msj += `  Cant: ${item.cantidad} un. x $${Math.round(pARS).toLocaleString('es-AR')} = *$${Math.round(subARS).toLocaleString('es-AR')}*`;
        if (CONFIG.USAR_DOLAR) msj += ` (USD ${(pUSD * item.cantidad).toFixed(2)})`;
        msj += `\n\n`;
    });

    msj += `--- *TOTALES ESTIMADOS* ---\n`;
    msj += `📦 *Total Unidades:* ${totalUnidadesGeneral}\n`;
    msj += `💰 *Total en ARS:* $${Math.round(totalARS).toLocaleString('es-AR')}\n`;
    if (CONFIG.USAR_DOLAR) {
        msj += `💵 *Total en USD:* USD ${totalUSD.toFixed(2)}\n`;
        msj += `ℹ️ *Cotización Aplicada:* $${COTIZACION_DOLAR} ARS/USD\n`;
    }

    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msj)}`;
    window.open(url, '_blank');
}
