const preferenciaMovimiento = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
);

/* =========================================
   RULETAS INDEPENDIENTES
========================================= */

document.querySelectorAll(".ruleta").forEach((contenedor) => {
    const imagen = contenedor.querySelector(".imagen-ruleta");

    if (!imagen) return;

    let rotacion = 0;
    let velocidad = 0;
    let punteroActivo = null;
    let anguloAnterior = null;
    let tiempoAnterior = 0;
    let ultimoMovimiento = 0;
    let animacion = null;
    let centroX = 0;
    let centroY = 0;

    function dibujar() {
        imagen.style.transform = `rotate(${rotacion}deg)`;
    }

    function detenerInercia() {
        if (animacion !== null) {
            cancelAnimationFrame(animacion);
        }

        animacion = null;
        velocidad = 0;
    }

    function actualizarCentro() {
        const limites = contenedor.getBoundingClientRect();

        centroX = limites.left + limites.width / 2;
        centroY = limites.top + limites.height / 2;
    }

    function obtenerAngulo(evento) {
        const x = evento.clientX - centroX;
        const y = evento.clientY - centroY;

        if (Math.hypot(x, y) < 20) {
            return null;
        }

        return Math.atan2(y, x) * 180 / Math.PI;
    }

    contenedor.addEventListener("pointerdown", (evento) => {
        if (punteroActivo !== null) return;

        if (evento.pointerType === "mouse" && evento.button !== 0) {
            return;
        }

        evento.preventDefault();

        detenerInercia();
        actualizarCentro();

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

        let diferencia = anguloActual - anguloAnterior;

        // Evita saltos entre 180° y -180°.
        diferencia = ((diferencia + 540) % 360) - 180;

        const tiempo = Math.max(ahora - tiempoAnterior, 1);

        rotacion += diferencia;
        velocidad = Math.max(-2, Math.min(2, diferencia / tiempo));

        anguloAnterior = anguloActual;
        tiempoAnterior = ahora;
        ultimoMovimiento = ahora;

        dibujar();
    });

    function iniciarInercia() {
        let ultimoFrame = performance.now();

        function continuarGiro(ahora) {
            const tiempo = Math.min(ahora - ultimoFrame, 32);
            ultimoFrame = ahora;

            rotacion += velocidad * tiempo;
            velocidad *= Math.pow(0.95, tiempo / 16.67);

            dibujar();

            if (Math.abs(velocidad) > 0.005) {
                animacion = requestAnimationFrame(continuarGiro);
            } else {
                velocidad = 0;
                animacion = null;
            }
        }

        animacion = requestAnimationFrame(continuarGiro);
    }

    function terminarArrastre(evento, usarInercia) {
        if (evento.pointerId !== punteroActivo) return;

        punteroActivo = null;
        anguloAnterior = null;

        contenedor.classList.remove("arrastrando");

        if (contenedor.hasPointerCapture(evento.pointerId)) {
            contenedor.releasePointerCapture(evento.pointerId);
        }

        if (
            !usarInercia ||
            preferenciaMovimiento.matches ||
            performance.now() - ultimoMovimiento > 100
        ) {
            velocidad = 0;
        }

        if (Math.abs(velocidad) > 0.005) {
            iniciarInercia();
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
        if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") {
            return;
        }

        if (punteroActivo !== null) return;

        evento.preventDefault();
        detenerInercia();

        rotacion += evento.key === "ArrowRight" ? 15 : -15;

        dibujar();
    });

    preferenciaMovimiento.addEventListener("change", (evento) => {
        if (evento.matches) {
            detenerInercia();
        }
    });

    dibujar();
});

/* =========================================
   DADOS Y MICRÓFONO
========================================= */

(() => {
    const boton = document.getElementById("activar-microfono");
    const estado = document.getElementById("estado-microfono");
    const medidor = document.getElementById("nivel-soplido");
    const dados = document.querySelectorAll(".contenedor-dados .dado");

    if (!boton || !estado || !medidor || dados.length === 0) {
        return;
    }

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

    // Aumenta este valor si reacciona demasiado al ruido.
    const UMBRAL = 0.025;

    // Disminuye este valor si necesitas soplar muy fuerte.
    const VOLUMEN_MAXIMO = 0.18;

    function restablecerDados() {
        dados.forEach((dado) => {
            dado.style.transform = "";
        });
    }

    function detenerMicrofono(
        mensaje = "El micrófono está apagado."
    ) {
        // Invalida las solicitudes de activación pendientes.
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
            const contextoAnterior = contextoAudio;
            contextoAudio = null;

            contextoAnterior.close().catch(() => {});
        }

        analizador = null;
        datos = null;
        intensidad = 0;

        medidor.value = 0;
        restablecerDados();

        boton.disabled = false;
        boton.textContent = "Activar micrófono";
        boton.setAttribute("aria-pressed", "false");

        estado.textContent = mensaje;
    }

    function actualizarDados(ahora) {
        if (!activo || !analizador || !datos) return;

        analizador.getFloatTimeDomainData(datos);

        let media = 0;

        for (let i = 0; i < datos.length; i++) {
            media += datos[i];
        }

        media /= datos.length;

        let suma = 0;

        for (let i = 0; i < datos.length; i++) {
            const muestra = datos[i] - media;
            suma += muestra * muestra;
        }

        const volumen = Math.sqrt(suma / datos.length);

        const objetivo = Math.max(
            0,
            Math.min(
                1,
                (volumen - UMBRAL) / (VOLUMEN_MAXIMO - UMBRAL)
            )
        );

        // Suaviza los cambios de intensidad.
        intensidad += (objetivo - intensidad) * 0.18;

        medidor.value = intensidad;

        if (preferenciaMovimiento.matches) {
            restablecerDados();
        } else {
            dados.forEach((dado, indice) => {
                const fase = indice * 2.4;

                const x =
                    Math.sin(ahora * 0.035 + fase) * intensidad * 4;

                const y =
                    Math.cos(ahora * 0.029 + fase) * intensidad * 3;

                const giro =
                    Math.sin(ahora * 0.025 + fase) * intensidad * 5;

                dado.style.transform =
                    `translate(${x}px, ${y}px) rotate(${giro}deg)`;
            });
        }

        animacion = requestAnimationFrame(actualizarDados);
    }

    async function activarMicrofono() {
        if (activo || iniciando) return;

        if (
            !window.isSecureContext ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            estado.textContent =
                "Abre la página mediante HTTPS en un navegador compatible para usar el micrófono.";
            return;
        }

        const AudioContextDisponible =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextDisponible) {
            estado.textContent =
                "Este navegador no permite analizar el audio.";
            return;
        }

        const solicitud = ++version;
        iniciando = true;

        boton.disabled = true;
        estado.textContent = "Permite el acceso al micrófono…";

        try {
            // Se inicia desde el toque del usuario.
            const contexto = new AudioContextDisponible();
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

            // Apaga el flujo si la solicitud ya fue cancelada.
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

            // No se conecta a los altavoces.
            activo = true;
            iniciando = false;

            boton.disabled = false;
            boton.textContent = "Apagar micrófono";
            boton.setAttribute("aria-pressed", "true");

            estado.textContent = preferenciaMovimiento.matches
                ? "Micrófono activo. Sopla para mover el indicador de volumen."
                : "Micrófono activo. ¡Sopla para mover los dados!";

            flujo.getAudioTracks().forEach((pista) => {
                pista.addEventListener("ended", () => {
                    if (solicitud === version) {
                        detenerMicrofono(
                            "Se interrumpió el micrófono. Puedes activarlo de nuevo."
                        );
                    }
                });
            });

            animacion = requestAnimationFrame(actualizarDados);
        } catch (error) {
            if (solicitud !== version) return;

            let mensaje = "No se pudo activar el micrófono.";

            if (error.name === "NotAllowedError") {
                mensaje =
                    "Permite el micrófono en los ajustes de este sitio e inténtalo de nuevo.";
            } else if (error.name === "NotFoundError") {
                mensaje = "No se encontró un micrófono disponible.";
            } else if (error.name === "NotReadableError") {
                mensaje =
                    "El micrófono no está disponible. Revisa si otra aplicación lo está usando.";
            }

            detenerMicrofono(mensaje);
        }
    }

    boton.addEventListener("click", () => {
        if (activo) {
            detenerMicrofono();
        } else {
            activarMicrofono();
        }
    });

    // Apaga el micrófono al cambiar de pestaña o aplicación.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && (activo || iniciando)) {
            detenerMicrofono();
        }
    });

    window.addEventListener("pagehide", () => {
        detenerMicrofono();
    });
})();