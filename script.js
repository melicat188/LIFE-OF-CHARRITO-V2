const preferenciaMovimiento = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
);

/* =========================================
   FUNCIONES COMPARTIDAS
========================================= */

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

        const x =
            Math.sin(ahora * 0.035 + fase) *
            intensidad * amplitud;

        const y =
            Math.cos(ahora * 0.029 + fase) *
            intensidad * amplitud * 0.75;

        const giro =
            Math.sin(ahora * 0.025 + fase) *
            intensidad * amplitud * 1.5;

        dado.style.transform =
            `translate(${x}px, ${y}px) rotate(${giro}deg)`;
    });
}

function estaVisible(elemento) {
    const limites = elemento.getBoundingClientRect();

    return limites.bottom > 0 &&
        limites.top < window.innerHeight;
}

/* =========================================
   RULETAS
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

        if (Math.hypot(x, y) < 20) return null;

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
        if (evento.matches) detenerInercia();
    });

    dibujar();
});

/* =========================================
   MICRÓFONO
========================================= */

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

    const UMBRAL = 0.025;
    const VOLUMEN_MAXIMO = 0.18;

    function detenerMicrofono(
        mensaje = "El micrófono está apagado."
    ) {
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

    function actualizarDados(ahora) {
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
            Math.min(
                1,
                (volumen - UMBRAL) / (VOLUMEN_MAXIMO - UMBRAL)
            )
        );

        intensidad += (objetivo - intensidad) * 0.18;

        medidor.value = intensidad;
        moverDados(dados, intensidad, ahora, 4);

        animacion = requestAnimationFrame(actualizarDados);
    }

    async function activarMicrofono() {
        if (activo || iniciando) return;

        if (
            !window.isSecureContext ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            estado.textContent =
                "Abre la página mediante HTTPS para usar el micrófono.";
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
        boton.textContent = "Cancelar activación";
        estado.textContent = "Permite el acceso al micrófono…";

        try {
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
                mensaje = "Permite el micrófono en los ajustes del sitio.";
            } else if (error.name === "NotFoundError") {
                mensaje = "No se encontró un micrófono disponible.";
            } else if (error.name === "NotReadableError") {
                mensaje =
                    "El micrófono no está disponible o lo usa otra aplicación.";
            }

            detenerMicrofono(mensaje);
        }
    }

    boton.addEventListener("click", () => {
        if (activo || iniciando) {
            detenerMicrofono();
        } else {
            activarMicrofono();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden && (activo || iniciando)) {
            detenerMicrofono();
        }
    });

    window.addEventListener("pagehide", () => detenerMicrofono());
})();

/* =========================================
   TRES SECCIONES DE SACUDIDA
========================================= */

(() => {
    let detenerSeccionActual = null;

    document.querySelectorAll(".seccion-sacudida").forEach((seccion) => {
        const boton = seccion.querySelector(".activar-movimiento");
        const estado = seccion.querySelector(".estado-movimiento");
        const nota = seccion.querySelector(".nota-movimiento");
        const medidor = seccion.querySelector(".nivel-sacudida");
        const dados = seccion.querySelectorAll(".dado");

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

        const UMBRAL_SACUDIDA = 0.3;
        const FUERZA_MAXIMA = 5;

        function actualizarNota() {
            if (!nota) return;

            nota.textContent = preferenciaMovimiento.matches
                ? "Movimiento reducido activado: la barra funciona, pero la animación de los dados está desactivada."
                : "";
        }

        actualizarNota();

        preferenciaMovimiento.addEventListener("change", () => {
            actualizarNota();

            if (preferenciaMovimiento.matches) {
                restablecerDados(dados);
            }
        });

        function detenerMovimiento(
            mensaje = "El sensor de movimiento está apagado."
        ) {
            version += 1;
            activo = false;
            iniciando = false;

            window.removeEventListener(
                "devicemotion",
                detectarMovimiento
            );

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

            medidor.value = 0;
            restablecerDados(dados);

            boton.textContent = "Activar movimiento";
            boton.setAttribute("aria-pressed", "false");
            estado.textContent = mensaje;

            if (detenerSeccionActual === detenerMovimiento) {
                detenerSeccionActual = null;
            }
        }

        function tieneCoordenadas(vector) {
            return vector &&
                Number.isFinite(vector.x) &&
                Number.isFinite(vector.y) &&
                Number.isFinite(vector.z);
        }

        function detectarMovimiento(evento) {
            if (!activo) return;

            if (!estaVisible(seccion)) {
                detenerMovimiento();
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
                    gravedad = {
                        x: vector.x,
                        y: vector.y,
                        z: vector.z
                    };
                }

                const tiempo = ultimaLectura === null
                    ? 16.67
                    : Math.min(ahora - ultimaLectura, 100);

                const filtro = Math.exp(-tiempo / 250);

                gravedad.x =
                    filtro * gravedad.x + (1 - filtro) * vector.x;

                gravedad.y =
                    filtro * gravedad.y + (1 - filtro) * vector.y;

                gravedad.z =
                    filtro * gravedad.z + (1 - filtro) * vector.z;

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

                estado.textContent =
                    "¡Sensor listo! Sacude suavemente el celular.";
            }

            const nuevaIntensidad = Math.max(
                0,
                Math.min(
                    1,
                    (fuerza - UMBRAL_SACUDIDA) /
                    (FUERZA_MAXIMA - UMBRAL_SACUDIDA)
                )
            );

            intensidad = Math.max(intensidad, nuevaIntensidad);
        }

        function animarDados(ahora) {
            if (!activo) return;

            if (!estaVisible(seccion)) {
                detenerMovimiento();
                return;
            }

            const tiempo = ultimoFrame === null
                ? 16.67
                : Math.min(ahora - ultimoFrame, 50);

            ultimoFrame = ahora;

            medidor.value = intensidad;
            moverDados(dados, intensidad, ahora, 20);

            intensidad *= Math.exp(-tiempo / 300);

            if (intensidad < 0.001) intensidad = 0;

            animacion = requestAnimationFrame(animarDados);
        }

        async function activarMovimiento() {
            if (activo || iniciando || !estaVisible(seccion)) return;

            if (!window.isSecureContext) {
                estado.textContent =
                    "Abre la página mediante HTTPS para usar el movimiento.";
                return;
            }

            const SensorMovimiento = window.DeviceMotionEvent;

            if (!SensorMovimiento) {
                estado.textContent =
                    "Este navegador no ofrece acceso al sensor de movimiento.";
                return;
            }

            if (detenerSeccionActual) {
                detenerSeccionActual();
            }

            detenerSeccionActual = detenerMovimiento;

            const solicitud = ++version;

            iniciando = true;
            boton.textContent = "Cancelar activación";
            estado.textContent = "Activando el sensor…";

            temporizador = setTimeout(() => {
                if (solicitud === version && !datosRecibidos) {
                    detenerMovimiento(
                        "No se recibieron datos. Revisa el permiso de sensores y abre el enlace directamente en Chrome o Safari."
                    );
                }
            }, 10000);

            try {
                if (
                    typeof SensorMovimiento.requestPermission === "function"
                ) {
                    const permiso =
                        await SensorMovimiento.requestPermission();

                    if (solicitud !== version) return;

                    if (permiso !== "granted") {
                        detenerMovimiento(
                            "Permite el movimiento en los ajustes del sitio."
                        );
                        return;
                    }
                }

                if (solicitud !== version) return;

                if (document.hidden || !estaVisible(seccion)) {
                    detenerMovimiento();
                    return;
                }

                activo = true;
                iniciando = false;

                boton.textContent = "Apagar movimiento";
                boton.setAttribute("aria-pressed", "true");

                estado.textContent =
                    "Esperando datos. Mueve suavemente el celular.";

                window.addEventListener(
                    "devicemotion",
                    detectarMovimiento,
                    { passive: true }
                );

                animacion = requestAnimationFrame(animarDados);
            } catch (error) {
                if (solicitud !== version) return;

                detenerMovimiento(
                    "No se pudo activar el sensor. Revisa los permisos."
                );
            }
        }

        boton.addEventListener("click", () => {
            if (activo || iniciando) {
                detenerMovimiento();
            } else {
                activarMovimiento();
            }
        });

        if ("IntersectionObserver" in window) {
            const observador = new IntersectionObserver((entradas) => {
                for (const entrada of entradas) {
                    if (!entrada.isIntersecting && (activo || iniciando)) {
                        detenerMovimiento();
                    }
                }
            });

            observador.observe(seccion);
        }

        document.addEventListener("visibilitychange", () => {
            if (document.hidden && (activo || iniciando)) {
                detenerMovimiento();
            }
        });

        window.addEventListener("pagehide", () => detenerMovimiento());
    });
})();

/* =========================================
   CARTAS QUE REACCIONAN A LA LUZ
========================================= */

(() => {
    const seccion = document.getElementById("seccion-cartas");
    const cartas = seccion?.querySelector(".cartas");
    const nota = seccion?.querySelector(".nota-cartas");
    const boton = document.getElementById("activar-camara");
    const estado = document.getElementById("estado-camara");
    const medidor = document.getElementById("nivel-luz");
    const video = document.getElementById("video-luz");

    if (!seccion || !cartas || !boton || !estado || !medidor || !video) {
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;

    const contexto = canvas.getContext("2d", {
        willReadFrequently: true
    });

    let flujo = null;
    let activo = false;
    let iniciando = false;
    let version = 0;

    let animacion = null;
    let temporizador = null;
    let ultimoAnalisis = null;

    let muestrasIniciales = [];
    let referencia = null;
    let brilloSuavizado = null;
    let cambioDesde = null;

    function actualizarNota() {
        if (!nota) return;

        nota.textContent = preferenciaMovimiento.matches
            ? "Movimiento reducido activado: las cartas cambian de posición sin animación."
            : "";
    }

    actualizarNota();
    preferenciaMovimiento.addEventListener("change", actualizarNota);

    function detenerCamara(
        mensaje = "La cámara está apagada."
    ) {
        version += 1;
        activo = false;
        iniciando = false;

        clearTimeout(temporizador);
        temporizador = null;

        if (animacion !== null) {
            cancelAnimationFrame(animacion);
            animacion = null;
        }

        if (flujo) {
            flujo.getTracks().forEach((pista) => pista.stop());
            flujo = null;
        }

        video.pause();
        video.srcObject = null;

        muestrasIniciales = [];
        referencia = null;
        brilloSuavizado = null;
        ultimoAnalisis = null;
        cambioDesde = null;

        medidor.value = 0;
        cartas.classList.remove("reveladas");

        boton.textContent = "Activar cámara";
        boton.setAttribute("aria-pressed", "false");
        estado.textContent = mensaje;
    }

    function medirBrillo() {
        contexto.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const pixeles = contexto.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        ).data;

        let total = 0;

        for (let i = 0; i < pixeles.length; i += 4) {
            total +=
                pixeles[i] * 0.2126 +
                pixeles[i + 1] * 0.7152 +
                pixeles[i + 2] * 0.0722;
        }

        return total / (pixeles.length / 4);
    }

    function analizarLuz(ahora) {
        if (!activo) return;

        if (!estaVisible(seccion)) {
            detenerCamara();
            return;
        }

        try {
            const puedeAnalizar =
                video.readyState >= 2 &&
                video.videoWidth > 0;

            const tocaAnalizar =
                ultimoAnalisis === null ||
                ahora - ultimoAnalisis >= 120;

            if (puedeAnalizar && tocaAnalizar) {
                ultimoAnalisis = ahora;

                const brillo = medirBrillo();

                brilloSuavizado = brilloSuavizado === null
                    ? brillo
                    : brilloSuavizado + (brillo - brilloSuavizado) * 0.3;

                medidor.value = brilloSuavizado;

                if (referencia === null) {
                    muestrasIniciales.push(brillo);

                    if (muestrasIniciales.length >= 18) {
                        referencia = muestrasIniciales.reduce(
                            (suma, valor) => suma + valor,
                            0
                        ) / muestrasIniciales.length;

                        clearTimeout(temporizador);
                        temporizador = null;

                        estado.textContent = referencia > 235
                            ? "Hay mucha luz inicial. Apaga la cámara y actívala cubriéndola parcialmente para calibrar de nuevo."
                            : "¡Listo! Deja entrar más luz en la cámara para voltear las cartas.";
                    }
                } else {
                    const margen = Math.max(10, referencia * 0.15);

                    const estanReveladas =
                        cartas.classList.contains("reveladas");

                    const debeCambiar = estanReveladas
                        ? brilloSuavizado < referencia + margen * 0.35
                        : brilloSuavizado > referencia + margen;

                    if (debeCambiar) {
                        if (cambioDesde === null) {
                            cambioDesde = ahora;
                        }

                        if (ahora - cambioDesde >= 400) {
                            cartas.classList.toggle(
                                "reveladas",
                                !estanReveladas
                            );

                            estado.textContent = estanReveladas
                                ? "La luz bajó. Deja entrar más luz para volver a voltearlas."
                                : "¡Más luz! Las tres cartas se voltearon.";

                            cambioDesde = null;
                        }
                    } else {
                        cambioDesde = null;
                    }
                }
            }

            animacion = requestAnimationFrame(analizarLuz);
        } catch (error) {
            detenerCamara(
                "No se pudo analizar la cámara. Vuelve a intentarlo."
            );
        }
    }

    async function activarCamara() {
        if (activo || iniciando) return;

        if (
            !window.isSecureContext ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            estado.textContent =
                "Abre la página mediante HTTPS para usar la cámara.";
            return;
        }

        if (!contexto) {
            estado.textContent =
                "Este navegador no permite analizar la imagen.";
            return;
        }

        const solicitud = ++version;

        iniciando = true;
        boton.textContent = "Cancelar activación";
        estado.textContent = "Permite el acceso a la cámara…";

        temporizador = setTimeout(() => {
            if (solicitud === version) {
                detenerCamara(
                    "La cámara no pudo prepararse. Revisa el permiso e inténtalo de nuevo."
                );
            }
        }, 20000);

        try {
            const nuevoFlujo = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 320 },
                    height: { ideal: 240 }
                }
            });

            if (solicitud !== version) {
                nuevoFlujo.getTracks().forEach((pista) => pista.stop());
                return;
            }

            flujo = nuevoFlujo;
            video.srcObject = flujo;
            video.muted = true;

            await video.play();

            if (solicitud !== version) return;

            if (document.hidden || !estaVisible(seccion)) {
                detenerCamara();
                return;
            }

            activo = true;
            iniciando = false;

            boton.textContent = "Apagar cámara";
            boton.setAttribute("aria-pressed", "true");

            estado.textContent =
                "Calibrando… Mantén la cámara con poca luz durante unos dos segundos.";

            flujo.getVideoTracks().forEach((pista) => {
                pista.addEventListener("ended", () => {
                    if (solicitud === version) {
                        detenerCamara(
                            "Se interrumpió la cámara. Puedes activarla de nuevo."
                        );
                    }
                });
            });

            animacion = requestAnimationFrame(analizarLuz);
        } catch (error) {
            if (solicitud !== version) return;

            let mensaje = "No se pudo activar la cámara.";

            if (error.name === "NotAllowedError") {
                mensaje =
                    "Permite el acceso a la cámara en los ajustes del sitio.";
            } else if (error.name === "NotFoundError") {
                mensaje = "No se encontró una cámara disponible.";
            } else if (error.name === "NotReadableError") {
                mensaje =
                    "La cámara no está disponible o la usa otra aplicación.";
            }

            detenerCamara(mensaje);
        }
    }

   