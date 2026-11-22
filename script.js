(() => {
    const preferenciaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* EFECTOS DE SONIDO */

    const efectos = (() => {
        const AudioDisponible = window.AudioContext || window.webkitAudioContext;

        if (!AudioDisponible) {
            return { reproducir() {}, detener() {} };
        }

        let contexto;

        try {
            contexto = new AudioDisponible();
        } catch {
            return { reproducir() {}, detener() {} };
        }

        const pistas = {
            dados: cargar("./assets/dados-audio.mpeg"),
            ruleta: cargar("./assets/ruleta-audio.mpeg"),
            gemas: cargar("./assets/gemas-audio.mpeg")
        };
        const reproduciendo = new Map();

        async function cargar(ruta) {
            try {
                const respuesta = await fetch(ruta);
                if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

                const datos = await respuesta.arrayBuffer();
                return await contexto.decodeAudioData(datos);
            } catch (error) {
                console.warn(`No se pudo cargar el efecto ${ruta}.`, error);
                return null;
            }
        }

        function activarAudio() {
            if (contexto.state !== "running") {
                contexto.resume().catch(() => {});
            }
        }

        document.addEventListener("pointerdown", activarAudio, true);
        document.addEventListener("pointerup", activarAudio, true);
        document.addEventListener("click", activarAudio, true);
        document.addEventListener("keydown", activarAudio, true);

        async function reproducir(nombre, clave = nombre) {
            if (reproduciendo.has(clave)) return;

            const turno = { fuente: null };
            reproduciendo.set(clave, turno);

            try {
                const pista = await pistas[nombre];

                // El movimiento pudo terminar mientras se cargaba el audio.
                if (reproduciendo.get(clave) !== turno) return;

                if (!pista) {
                    reproduciendo.delete(clave);
                    return;
                }

                const fuente = contexto.createBufferSource();
                fuente.buffer = pista;
                fuente.connect(contexto.destination);

                fuente.addEventListener("ended", () => {
                    fuente.disconnect();

                    if (reproduciendo.get(clave) === turno) {
                        reproduciendo.delete(clave);
                    }
                }, { once: true });

                fuente.start();
                turno.fuente = fuente;
            } catch (error) {
                if (reproduciendo.get(clave) === turno) {
                    reproduciendo.delete(clave);
                }

                console.warn(`No se pudo reproducir el efecto ${nombre}.`, error);
            }
        }

        function detener(clave) {
            const turno = reproduciendo.get(clave);
            reproduciendo.delete(clave);
            turno?.fuente?.stop();
        }

        return { reproducir, detener };
    })();

    /* FUNCIONES COMPARTIDAS */

    function restablecerDados(dados) {
        dados.forEach((dado) => {
            dado.style.transform = "";
        });
    }

    function moverDados(dados, intensidad, ahora, amplitud) {
        if (preferenciaMovimiento.matches) {
            restablecerDados(dados);
            return;
        }

        dados.forEach((dado, indice) => {
            const fase = indice * 2.4;
            const x = Math.sin(ahora * 0.035 + fase) * intensidad * amplitud;
            const y = Math.cos(ahora * 0.029 + fase) * intensidad * amplitud * 0.75;
            const giro = Math.sin(ahora * 0.025 + fase) * intensidad * amplitud * 1.5;

            dado.style.transform = `translate(${x}px, ${y}px) rotate(${giro}deg)`;
        });
    }

    function estaVisible(elemento) {
        const limites = elemento.getBoundingClientRect();
        return limites.bottom > 0 && limites.top < window.innerHeight;
    }

    /* RULETAS */

    const dialogoRuleta = document.getElementById("resultado-ruleta");
    const tituloResultado = document.getElementById("titulo-resultado-ruleta");
    const gemasResultado = document.getElementById("gemas-resultado-ruleta");

    const resultadosRuleta = {
        perdida: { mensaje: "Pierdes dos gemas", cantidad: 1, etiqueta: "Una gema" },
        ganancia: { mensaje: "Ganaste cinco gemas", cantidad: 5, etiqueta: "Cinco gemas" }
    };

    const giroMinimo = 15;

    document.querySelectorAll(".ruleta").forEach((contenedor) => {
        const imagen = contenedor.querySelector(".imagen-ruleta");
        if (!imagen) return;

        const dialogoGiro = contenedor.closest(".dialogo-giro-ruleta");
        const botonAbrir = dialogoGiro && document.querySelector(
            `[aria-controls="${dialogoGiro.id}"]`
        );
        const resultado = resultadosRuleta[contenedor.dataset.resultado];

        let resultadoMostrado = false;
        let sonidoUsado = false;
        let temporizadorTeclado = null;
        let rotacion = 0;
        let velocidad = 0;
        let giroAcumulado = 0;
        let punteroActivo = null;
        let anguloAnterior = null;
        let tiempoAnterior = 0;
        let ultimoMovimiento = 0;
        let animacion = null;
        let centroX = 0;
        let centroY = 0;

        botonAbrir?.addEventListener("click", () => {
            if (!dialogoGiro.open && typeof dialogoGiro.showModal === "function") {
                dialogoGiro.showModal();
            }
        });

        dialogoGiro?.addEventListener("close", () => {
            if (dialogoGiro.open) return;

            clearTimeout(temporizadorTeclado);
            temporizadorTeclado = null;

            const puntero = punteroActivo;
            punteroActivo = null;
            anguloAnterior = null;
            contenedor.classList.remove("arrastrando");

            if (puntero !== null && contenedor.hasPointerCapture(puntero)) {
                contenedor.releasePointerCapture(puntero);
            }

            detenerInercia();
        });

        function dibujar() {
            imagen.style.transform = `rotate(${rotacion}deg)`;
        }

        function sonarRuleta() {
            if (sonidoUsado) return;

            sonidoUsado = true;
            efectos.reproducir("ruleta", contenedor);
        }

        function mostrarResultado() {
            if (
                resultadoMostrado ||
                (dialogoGiro && !dialogoGiro.open) ||
                !resultado ||
                typeof dialogoRuleta?.showModal !== "function" ||
                !tituloResultado ||
                !gemasResultado ||
                dialogoRuleta.open
            ) {
                return;
            }

            tituloResultado.textContent = resultado.mensaje;
            gemasResultado.replaceChildren();
            gemasResultado.setAttribute("aria-label", resultado.etiqueta);

            for (let numero = 0; numero < resultado.cantidad; numero += 1) {
                const gema = document.createElement("img");
                gema.src = "assets/image.png";
                gema.alt = "";
                gemasResultado.append(gema);
            }

            if (dialogoGiro?.open) dialogoGiro.close();
            dialogoRuleta.showModal();
            resultadoMostrado = true;
            efectos.reproducir("gemas", resultado);
        }

        function detenerInercia(cortarSonido = true) {
            if (animacion !== null) cancelAnimationFrame(animacion);

            animacion = null;
            velocidad = 0;

            if (cortarSonido) efectos.detener(contenedor);
        }

        function actualizarCentro() {
            const limites = contenedor.getBoundingClientRect();
            centroX = limites.left + limites.width / 2;
            centroY = limites.top + limites.height / 2;
        }

        function obtenerAngulo(evento) {
            const x = evento.clientX - centroX;
            const y = evento.clientY - centroY;

            if (Math.hypot(x, y) < 20) return null;
            return Math.atan2(y, x) * 180 / Math.PI;
        }

        contenedor.addEventListener("pointerdown", (evento) => {
            if (punteroActivo !== null) return;
            if (evento.pointerType === "mouse" && evento.button !== 0) return;

            evento.preventDefault();
            clearTimeout(temporizadorTeclado);
            temporizadorTeclado = null;
            detenerInercia();
            actualizarCentro();

            giroAcumulado = 0;
            punteroActivo = evento.pointerId;
            anguloAnterior = obtenerAngulo(evento);
            tiempoAnterior = performance.now();
            ultimoMovimiento = tiempoAnterior;

            imagen.focus({ preventScroll: true });
            contenedor.classList.add("arrastrando");
            contenedor.setPointerCapture(evento.pointerId);
        });

        contenedor.addEventListener("pointermove", (evento) => {
            if (evento.pointerId !== punteroActivo) return;

            evento.preventDefault();
            actualizarCentro();

            const ahora = performance.now();
            const anguloActual = obtenerAngulo(evento);

            if (anguloActual === null || anguloAnterior === null) {
                anguloAnterior = anguloActual;
                tiempoAnterior = ahora;
                velocidad = 0;
                return;
            }

            const diferencia = ((anguloActual - anguloAnterior + 540) % 360) - 180;
            const tiempo = Math.max(ahora - tiempoAnterior, 1);
            const giroAnterior = giroAcumulado;

            rotacion += diferencia;
            giroAcumulado += Math.abs(diferencia);
            velocidad = Math.max(-2, Math.min(2, diferencia / tiempo));

            if (giroAnterior < giroMinimo && giroAcumulado >= giroMinimo) {
                sonarRuleta();
            }

            anguloAnterior = anguloActual;
            tiempoAnterior = ahora;
            ultimoMovimiento = ahora;
            dibujar();
        });

        function iniciarInercia(giroValido) {
            let ultimoFrame = performance.now();

            function continuarGiro(ahora) {
                const tiempo = Math.max(0, Math.min(ahora - ultimoFrame, 32));
                ultimoFrame = ahora;

                rotacion += velocidad * tiempo;
                velocidad *= Math.pow(0.95, tiempo / 16.67);
                dibujar();

                if (Math.abs(velocidad) > 0.005) {
                    animacion = requestAnimationFrame(continuarGiro);
                    return;
                }

                detenerInercia();
                if (giroValido) mostrarResultado();
            }

            animacion = requestAnimationFrame(continuarGiro);
        }

        function terminarArrastre(evento, completado) {
            if (evento.pointerId !== punteroActivo) return;

            punteroActivo = null;
            anguloAnterior = null;
            contenedor.classList.remove("arrastrando");

            if (contenedor.hasPointerCapture(evento.pointerId)) {
                contenedor.releasePointerCapture(evento.pointerId);
            }

            if (!completado) {
                detenerInercia();
                return;
            }

            const giroValido = giroAcumulado >= giroMinimo;

            if (
                preferenciaMovimiento.matches ||
                performance.now() - ultimoMovimiento > 100
            ) {
                velocidad = 0;
            }

            if (Math.abs(velocidad) > 0.005) {
                iniciarInercia(giroValido);
            } else {
                efectos.detener(contenedor);
                if (giroValido) mostrarResultado();
            }
        }

        contenedor.addEventListener("pointerup", (evento) => {
            terminarArrastre(evento, true);
        });

        contenedor.addEventListener("pointercancel", (evento) => {
            terminarArrastre(evento, false);
        });

        contenedor.addEventListener("lostpointercapture", (evento) => {
            terminarArrastre(evento, false);
        });

        imagen.addEventListener("dragstart", (evento) => {
            evento.preventDefault();
        });

        imagen.addEventListener("keydown", (evento) => {
            if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
            if (punteroActivo !== null) return;

            evento.preventDefault();
            detenerInercia(false);
            rotacion += evento.key === "ArrowRight" ? giroMinimo : -giroMinimo;
            dibujar();
            sonarRuleta();

            clearTimeout(temporizadorTeclado);
            temporizadorTeclado = setTimeout(() => {
                temporizadorTeclado = null;
                efectos.detener(contenedor);
                mostrarResultado();
            }, 350);
        });

        imagen.addEventListener("blur", () => {
            if (temporizadorTeclado === null) return;

            clearTimeout(temporizadorTeclado);
            temporizadorTeclado = null;
            efectos.detener(contenedor);
        });

        preferenciaMovimiento.addEventListener("change", (evento) => {
            if (!evento.matches || animacion === null) return;

            detenerInercia();
            if (giroAcumulado >= giroMinimo) mostrarResultado();
        });

        dibujar();
    });

    /* MICRÓFONO */

    (() => {
        const boton = document.getElementById("activar-microfono");
        const estado = document.getElementById("estado-microfono");
        const medidor = document.getElementById("nivel-soplido");
        const dados = document.querySelectorAll("#dados-soplido .dado");

        if (!boton || !estado || !medidor || !dados.length) return;

        let contextoAudio = null;
        let flujo = null;
        let fuente = null;
        let analizador = null;
        let datos = null;
        let animacion = null;
        let activo = false;
        let iniciando = false;
        let version = 0;
        let intensidad = 0;

        function detener(mensaje = "El micrófono está apagado.") {
            version += 1;
            activo = false;
            iniciando = false;

            if (animacion !== null) {
                cancelAnimationFrame(animacion);
                animacion = null;
            }

            if (fuente) {
                fuente.disconnect();
                fuente = null;
            }

            if (flujo) {
                flujo.getTracks().forEach((pista) => pista.stop());
                flujo = null;
            }

            if (contextoAudio) {
                contextoAudio.close().catch(() => {});
                contextoAudio = null;
            }

            analizador = null;
            datos = null;
            intensidad = 0;
            medidor.value = 0;
            restablecerDados(dados);

            boton.textContent = "Activar micrófono";
            boton.setAttribute("aria-pressed", "false");
            estado.textContent = mensaje;
        }

        function analizar(ahora) {
            if (!activo || !analizador || !datos) return;

            analizador.getFloatTimeDomainData(datos);

            let media = 0;
            for (const muestra of datos) {
                media += muestra;
            }
            media /= datos.length;

            let suma = 0;
            for (const muestra of datos) {
                suma += (muestra - media) ** 2;
            }

            const volumen = Math.sqrt(suma / datos.length);
            const objetivo = Math.max(
                0,
                Math.min(1, (volumen - 0.025) / (0.18 - 0.025))
            );

            intensidad += (objetivo - intensidad) * 0.18;
            medidor.value = intensidad;
            moverDados(dados, intensidad, ahora, 4);
            animacion = requestAnimationFrame(analizar);
        }

        async function activar() {
            if (activo || iniciando) return;

            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
                estado.textContent = "Abre la página mediante HTTPS para usar el micrófono.";
                return;
            }

            const AudioDisponible = window.AudioContext || window.webkitAudioContext;

            if (!AudioDisponible) {
                estado.textContent = "Este navegador no permite analizar el audio.";
                return;
            }

            const solicitud = ++version;
            iniciando = true;
            boton.textContent = "Cancelar activación";
            estado.textContent = "Permite el acceso al micrófono…";

            try {
                const contexto = new AudioDisponible();
                contextoAudio = contexto;
                await contexto.resume();

                if (solicitud !== version) return;

                const nuevoFlujo = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    },
                    video: false
                });

                if (solicitud !== version) {
                    nuevoFlujo.getTracks().forEach((pista) => pista.stop());
                    return;
                }

                flujo = nuevoFlujo;
                analizador = contexto.createAnalyser();
                analizador.fftSize = 2048;
                datos = new Float32Array(analizador.fftSize);

                fuente = contexto.createMediaStreamSource(flujo);
                fuente.connect(analizador);

                activo = true;
                iniciando = false;

                boton.textContent = "Apagar micrófono";
                boton.setAttribute("aria-pressed", "true");

                estado.textContent = preferenciaMovimiento.matches
                    ? "Micrófono activo. Movimiento reducido activado: observa la barra."
                    : "Micrófono activo. ¡Sopla para mover los dados!";

                flujo.getAudioTracks().forEach((pista) => {
                    pista.addEventListener("ended", () => {
                        if (solicitud === version) {
                            detener("Se interrumpió el micrófono.");
                        }
                    });
                });

                animacion = requestAnimationFrame(analizar);
            } catch (error) {
                if (solicitud !== version) return;

                detener(
                    error.name === "NotAllowedError"
                        ? "Permite el micrófono en los ajustes del sitio."
                        : "No se pudo activar el micrófono. Revisa su disponibilidad."
                );
            }
        }

        boton.addEventListener("click", () => {
            if (activo || iniciando) {
                detener();
            } else {
                activar();
            }
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden && (activo || iniciando)) detener();
        });

        window.addEventListener("pagehide", () => detener());
    })();

    /* TRES SACUDIDAS */

    (() => {
        const umbralSacudida = 0.06;
        const pausaParaMostrarResultado = 700;
        let detenerActual = null;

        document.querySelectorAll(".seccion-sacudida").forEach((seccion) => {
            const boton = seccion.querySelector(".activar-movimiento");
            const estado = seccion.querySelector(".estado-movimiento");
            const nota = seccion.querySelector(".nota-movimiento");
            const medidor = seccion.querySelector(".nivel-sacudida");
            const dados = seccion.querySelectorAll(".dado");
            const imagenResultado = seccion.dataset.dadoResultado;

            if (!boton || !estado || !medidor || !dados.length) return;

            let activo = false;
            let iniciando = false;
            let version = 0;
            let animacion = null;
            let temporizador = null;
            let intensidad = 0;
            let ultimoFrame = null;
            let ultimaLectura = null;
            let gravedad = null;
            let datosRecibidos = false;
            let ultimaSacudida = null;
            let ultimoMovimientoSonoro = null;
            let sonidoDadosUsado = false;
            let resultadoSolicitado = false;

            function actualizarNota() {
                if (!nota) return;

                nota.textContent = preferenciaMovimiento.matches
                    ? "Movimiento reducido activado: observa la barra; la animación está desactivada."
                    : "";
            }

            actualizarNota();

            preferenciaMovimiento.addEventListener("change", () => {
                actualizarNota();
                if (preferenciaMovimiento.matches) restablecerDados(dados);
            });

            function detener(mensaje = "El sensor de movimiento está apagado.") {
                version += 1;
                activo = false;
                iniciando = false;

                window.removeEventListener("devicemotion", detectar);
                clearTimeout(temporizador);
                temporizador = null;

                if (animacion !== null) {
                    cancelAnimationFrame(animacion);
                    animacion = null;
                }

                intensidad = 0;
                ultimoFrame = null;
                ultimaLectura = null;
                gravedad = null;
                datosRecibidos = false;
                ultimaSacudida = null;
                ultimoMovimientoSonoro = null;
                efectos.detener(seccion);
                medidor.value = 0;
                restablecerDados(dados);

                boton.textContent = "Activar movimiento";
                boton.setAttribute("aria-pressed", "false");
                estado.textContent = mensaje;

                if (detenerActual === detener) detenerActual = null;
            }

            function tieneCoordenadas(vector) {
                return vector &&
                    Number.isFinite(vector.x) &&
                    Number.isFinite(vector.y) &&
                    Number.isFinite(vector.z);
            }

            function detectar(evento) {
                if (!activo) return;

                if (!estaVisible(seccion)) {
                    detener();
                    return;
                }

                const ahora = performance.now();
                let vector = evento.acceleration;
                let fuerza = 0;

                if (tieneCoordenadas(vector)) {
                    fuerza = Math.hypot(vector.x, vector.y, vector.z);
                } else {
                    vector = evento.accelerationIncludingGravity;
                    if (!tieneCoordenadas(vector)) return;

                    if (!gravedad) {
                        gravedad = { x: vector.x, y: vector.y, z: vector.z };
                    }

                    const tiempo = ultimaLectura === null
                        ? 16.67
                        : Math.min(ahora - ultimaLectura, 100);

                    const filtro = Math.exp(-tiempo / 250);
                    gravedad.x = filtro * gravedad.x + (1 - filtro) * vector.x;
                    gravedad.y = filtro * gravedad.y + (1 - filtro) * vector.y;
                    gravedad.z = filtro * gravedad.z + (1 - filtro) * vector.z;

                    fuerza = Math.hypot(
                        vector.x - gravedad.x,
                        vector.y - gravedad.y,
                        vector.z - gravedad.z
                    );
                }

                ultimaLectura = ahora;

                if (!datosRecibidos) {
                    datosRecibidos = true;
                    clearTimeout(temporizador);
                    temporizador = null;
                    estado.textContent = "¡Sensor listo! Sacude suavemente el celular.";
                }

                const nuevaIntensidad = Math.max(
                    0,
                    Math.min(1, (fuerza - 0.3) / (5 - 0.3))
                );

                intensidad = Math.max(intensidad, nuevaIntensidad);

                if (nuevaIntensidad >= umbralSacudida) {
                    if (!sonidoDadosUsado) {
                        sonidoDadosUsado = true;
                        efectos.reproducir("dados", seccion);
                        ultimoMovimientoSonoro = ahora;
                    } else if (ultimoMovimientoSonoro !== null) {
                        ultimoMovimientoSonoro = ahora;
                    }

                    if (!resultadoSolicitado) ultimaSacudida = ahora;
                }
            }

            function mostrarResultado() {
                resultadoSolicitado = true;
                ultimaSacudida = null;

                const imagen = new Image();

                imagen.onload = () => {
                    dados.forEach((dado) => {
                        dado.src = imagenResultado;
                    });

                    if (activo) estado.textContent = "Resultado de la tirada.";
                };

                imagen.onerror = () => {
                    resultadoSolicitado = false;
                    estado.textContent =
                        `No se pudo cargar ${imagenResultado}. Revisa el nombre y la extensión del archivo.`;
                };

                imagen.src = imagenResultado;
            }

            function animar(ahora) {
                if (!activo) return;

                if (!estaVisible(seccion)) {
                    detener();
                    return;
                }

                const tiempo = ultimoFrame === null
                    ? 16.67
                    : Math.min(ahora - ultimoFrame, 50);

                ultimoFrame = ahora;
                medidor.value = intensidad;
                moverDados(dados, intensidad, ahora, 20);

                if (
                    ultimoMovimientoSonoro !== null &&
                    ahora - ultimoMovimientoSonoro >= pausaParaMostrarResultado
                ) {
                    efectos.detener(seccion);
                    ultimoMovimientoSonoro = null;
                }

                if (
                    imagenResultado &&
                    !resultadoSolicitado &&
                    ultimaSacudida !== null &&
                    ahora - ultimaSacudida >= pausaParaMostrarResultado
                ) {
                    mostrarResultado();
                }

                intensidad *= Math.exp(-tiempo / 300);
                if (intensidad < 0.001) intensidad = 0;

                animacion = requestAnimationFrame(animar);
            }

            async function activar() {
                if (activo || iniciando || !estaVisible(seccion)) return;

                if (!window.isSecureContext) {
                    estado.textContent = "Abre la página mediante HTTPS para usar el movimiento.";
                    return;
                }

                const Sensor = window.DeviceMotionEvent;

                if (!Sensor) {
                    estado.textContent = "Este navegador no ofrece acceso al sensor.";
                    return;
                }

                if (detenerActual) detenerActual();
                detenerActual = detener;

                const solicitud = ++version;
                iniciando = true;
                boton.textContent = "Cancelar activación";
                estado.textContent = "Activando el sensor…";

                temporizador = setTimeout(() => {
                    if (solicitud === version && !datosRecibidos) {
                        detener(
                            "No llegaron datos. Revisa el permiso de sensores y abre el sitio directamente en Chrome o Safari."
                        );
                    }
                }, 10000);

                try {
                    if (typeof Sensor.requestPermission === "function") {
                        const permiso = await Sensor.requestPermission();
                        if (solicitud !== version) return;

                        if (permiso !== "granted") {
                            detener("Permite el movimiento en los ajustes del sitio.");
                            return;
                        }
                    }

                    if (solicitud !== version) return;

                    if (document.hidden || !estaVisible(seccion)) {
                        detener();
                        return;
                    }

                    activo = true;
                    iniciando = false;

                    boton.textContent = "Apagar movimiento";
                    boton.setAttribute("aria-pressed", "true");
                    estado.textContent = "Esperando datos. Mueve suavemente el celular.";

                    window.addEventListener("devicemotion", detectar, { passive: true });
                    animacion = requestAnimationFrame(animar);
                } catch (error) {
                    if (solicitud !== version) return;
                    detener("No se pudo activar el sensor. Revisa los permisos.");
                }
            }

            boton.addEventListener("click", () => {
                if (activo || iniciando) {
                    detener();
                } else {
                    activar();
                }
            });

            if ("IntersectionObserver" in window) {
                const observador = new IntersectionObserver((entradas) => {
                    for (const entrada of entradas) {
                        if (!entrada.isIntersecting && (activo || iniciando)) {
                            detener();
                        }
                    }
                });

                observador.observe(seccion);
            }

            document.addEventListener("visibilitychange", () => {
                if (document.hidden && (activo || iniciando)) detener();
            });

            window.addEventListener("pagehide", () => detener());
        });
    })();

    /* EFECTO DE ESCRITURA PARA TEXTOS MARCADOS */

    (() => {
        if (preferenciaMovimiento.matches || !("IntersectionObserver" in window)) {
            return;
        }

        const milisegundosPorLetra = 45;
        const dialogosPorSeccion = new Map();
        const dialogosPorInicio = new Map();

        for (const elemento of document.querySelectorAll("[data-escritura]")) {
            const seccion = elemento.closest("section") || elemento;
            const texto = elemento.textContent.trim().replace(/\s+/g, " ");
            if (!texto) continue;

            const visible = document.createTextNode("");
            const pendiente = document.createElement("span");
            pendiente.style.opacity = "0";
            pendiente.textContent = texto;
            elemento.replaceChildren(visible, pendiente);

            if (!dialogosPorSeccion.has(seccion)) {
                dialogosPorSeccion.set(seccion, []);
            }

            dialogosPorSeccion.get(seccion).push({
                elemento,
                texto,
                letras: Array.from(texto),
                visible,
                pendiente
            });
        }

        function escribirDialogos(dialogos) {
            let indice = 0;
            let inicio;

            function escribir(ahora) {
                if (preferenciaMovimiento.matches) return;

                const { elemento, texto, letras, visible, pendiente } = dialogos[indice];
                inicio ??= ahora;

                const cantidad = 1 + Math.floor(
                    (ahora - inicio) / milisegundosPorLetra
                );

                if (cantidad >= letras.length) {
                    elemento.textContent = texto;
                    indice += 1;

                    if (indice === dialogos.length) return;

                    inicio = undefined;
                } else {
                    visible.data = letras.slice(0, cantidad).join("");
                    pendiente.textContent = letras.slice(cantidad).join("");
                }

                requestAnimationFrame(escribir);
            }

            requestAnimationFrame(escribir);
        }

        const observador = new IntersectionObserver((entradas) => {
            for (const entrada of entradas) {
                if (entrada.intersectionRatio < 0.25) continue;

                const dialogos = dialogosPorInicio.get(entrada.target);
                if (!dialogos) continue;

                observador.unobserve(entrada.target);
                dialogosPorInicio.delete(entrada.target);
                escribirDialogos(dialogos);
            }
        }, { threshold: 0.25 });

        for (const dialogos of dialogosPorSeccion.values()) {
            const primerDialogo = dialogos[0].elemento;
            dialogosPorInicio.set(primerDialogo, dialogos);
            observador.observe(primerDialogo);
        }

        preferenciaMovimiento.addEventListener("change", (evento) => {
            if (!evento.matches) return;

            observador.disconnect();
            dialogosPorInicio.clear();

            for (const dialogos of dialogosPorSeccion.values()) {
                for (const { elemento, texto } of dialogos) {
                    elemento.textContent = texto;
                }
            }
        });
    })();
})();

/* MÚSICA DE FONDO */

(() => {
    const boton = document.getElementById("control-musica");
    const estado = document.getElementById("estado-musica");

    if (!boton || !estado) return;

    const AudioContextDisponible = window.AudioContext || window.webkitAudioContext;

    function mostrarEstado(mensaje) {
        estado.textContent = mensaje;
        estado.hidden = !mensaje;
    }

    if (!AudioContextDisponible) {
        boton.disabled = true;
        mostrarEstado("Este navegador no permite reproducir el bucle de música.");
        return;
    }

    let contexto;

    try {
        contexto = new AudioContextDisponible();
    } catch {
        boton.disabled = true;
        mostrarEstado("No se pudo iniciar el audio en este navegador.");
        return;
    }

    const volumen = contexto.createGain();
    volumen.gain.value = 0.25;
    volumen.connect(contexto.destination);

    function actualizarBoton() {
        boton.textContent = contexto.state === "running"
            ? "Pausar música"
            : "Activar música";
    }

    contexto.addEventListener("statechange", actualizarBoton);

    boton.addEventListener("click", async () => {
        try {
            if (contexto.state === "running") {
                await contexto.suspend();
            } else {
                await contexto.resume();
            }

            actualizarBoton();
        } catch {
            mostrarEstado("No se pudo cambiar la reproducción de la música.");
        }
    });

    async function prepararBucle() {
        mostrarEstado("Cargando música…");

        try {
            const respuesta = await fetch("./assets/loop%20final%20v2.wav");
            if (!respuesta.ok) throw new Error("No se encontró el WAV.");

            const datos = await respuesta.arrayBuffer();
            const pista = await contexto.decodeAudioData(datos);

            const fuente = contexto.createBufferSource();
            fuente.buffer = pista;
            fuente.loop = true;
            fuente.connect(volumen);
            fuente.start();

            mostrarEstado("");
        } catch {
            boton.disabled = true;
            mostrarEstado("No se pudo cargar loop final v2.wav.");
        }
    }

    actualizarBoton();
    prepararBucle();
})();