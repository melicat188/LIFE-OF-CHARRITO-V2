(() => {
    function iniciarControlCamara() {
        const seccion = document.getElementById("seccion-cartas");
        const boton = document.getElementById("activar-camara");
        const estado = document.getElementById("estado-camara");
        const medidor = document.getElementById("nivel-luz");
        const video = document.getElementById("video-luz");
        const cartas = seccion?.querySelector(".cartas");
        const nota = seccion?.querySelector(".nota-cartas");

        if (!boton || !estado) return;

        if (!seccion || !medidor || !video || !cartas) {
            estado.textContent =
                "Faltan elementos de las cartas en el HTML.";
            return;
        }

        const preferenciaMovimiento = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );

        function actualizarNota() {
            if (!nota) return;

            nota.textContent = preferenciaMovimiento.matches
                ? "Movimiento reducido activado: las cartas cambian de posición sin animación."
                : "";
        }

        actualizarNota();
        preferenciaMovimiento.addEventListener("change", actualizarNota);

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
        let muestras = [];
        let referencia = null;
        let brilloSuavizado = null;
        let cambioDesde = null;

        // Confirma que este archivo se cargó correctamente.
        estado.textContent = "Cámara lista para activar.";

        function detener(
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

            muestras = [];
            referencia = null;
            brilloSuavizado = null;
            ultimoAnalisis = null;
            cambioDesde = null;

            cartas.classList.remove("reveladas");
            medidor.value = 0;

            boton.textContent = "Activar cámara";
            boton.setAttribute("aria-pressed", "false");

            estado.textContent = mensaje;
        }

        function medirBrillo() {
            contexto.drawImage(video, 0, 0, 32, 24);

            const pixeles = contexto.getImageData(
                0, 0, 32, 24
            ).data;

            let suma = 0;

            for (let i = 0; i < pixeles.length; i += 4) {
                suma +=
                    pixeles[i] * 0.2126 +
                    pixeles[i + 1] * 0.7152 +
                    pixeles[i + 2] * 0.0722;
            }

            return suma / (pixeles.length / 4);
        }

        function analizar(ahora) {
            if (!activo) return;

            try {
                const videoListo =
                    video.readyState >= 2 &&
                    video.videoWidth > 0;

                const tocaAnalizar =
                    ultimoAnalisis === null ||
                    ahora - ultimoAnalisis >= 120;

                if (videoListo && tocaAnalizar) {
                    ultimoAnalisis = ahora;

                    const brillo = medirBrillo();

                    brilloSuavizado = brilloSuavizado === null
                        ? brillo
                        : brilloSuavizado +
                          (brillo - brilloSuavizado) * 0.3;

                    medidor.value = brilloSuavizado;

                    if (referencia === null) {
                        muestras.push(brillo);

                        // Aproximadamente dos segundos de calibración.
                        if (muestras.length >= 18) {
                            referencia = muestras.reduce(
                                (suma, valor) => suma + valor,
                                0
                            ) / muestras.length;

                            clearTimeout(temporizador);
                            temporizador = null;

                            estado.textContent = referencia > 235
                                ? "La luz inicial es demasiado alta. Apaga la cámara y actívala cubriéndola parcialmente."
                                : "¡Listo! Destapa la cámara o busca más luz para voltear las cartas.";
                        }
                    } else {
                        // Ignora pequeñas variaciones del brillo.
                        const margen = Math.max(
                            10,
                            referencia * 0.15
                        );

                        const reveladas =
                            cartas.classList.contains("reveladas");

                        // Diferentes umbrales evitan parpadeos.
                        const debeCambiar = reveladas
                            ? brilloSuavizado <
                              referencia + margen * 0.35
                            : brilloSuavizado >
                              referencia + margen;

                        if (debeCambiar) {
                            if (cambioDesde === null) {
                                cambioDesde = ahora;
                            }

                            if (ahora - cambioDesde >= 400) {
                                cartas.classList.toggle(
                                    "reveladas",
                                    !reveladas
                                );

                                estado.textContent = reveladas
                                    ? "La luz bajó. Deja entrar más luz para voltearlas otra vez."
                                    : "¡Más luz! Las cartas se voltearon.";

                                cambioDesde = null;
                            }
                        } else {
                            cambioDesde = null;
                        }
                    }
                }

                animacion = requestAnimationFrame(analizar);
            } catch (error) {
                detener(
                    "No se pudo analizar la imagen de la cámara."
                );
            }
        }

        async function activar() {
            if (activo || iniciando) return;

            estado.textContent = "Comprobando acceso a la cámara…";

            if (
                !window.isSecureContext ||
                !navigator.mediaDevices?.getUserMedia
            ) {
                estado.textContent =
                    "La cámara necesita una página HTTPS abierta directamente en Chrome.";
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

            temporizador = setTimeout(() => {
                if (solicitud === version) {
                    detener(
                        "La cámara no pudo prepararse. Revisa el permiso de cámara del sitio e inténtalo de nuevo."
                    );
                }
            }, 20000);

            try {
                estado.textContent =
                    "Permite el acceso a la cámara cuando Chrome lo solicite.";

                const nuevoFlujo =
                    await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            facingMode: { ideal: "environment" },
                            width: { ideal: 320 },
                            height: { ideal: 240 }
                        }
                    });

                if (solicitud !== version) {
                    nuevoFlujo.getTracks().forEach(
                        (pista) => pista.stop()
                    );
                    return;
                }

                flujo = nuevoFlujo;
                video.srcObject = flujo;
                video.muted = true;
                video.playsInline = true;

                await video.play();

                if (solicitud !== version) return;

                if (document.hidden) {
                    detener();
                    return;
                }

                activo = true;
                iniciando = false;

                boton.textContent = "Apagar cámara";
                boton.setAttribute("aria-pressed", "true");

                estado.textContent =
                    "Calibrando… Mantén la cámara parcialmente cubierta durante unos dos segundos.";

                flujo.getVideoTracks().forEach((pista) => {
                    pista.addEventListener("ended", () => {
                        if (solicitud === version) {
                            detener(
                                "Se interrumpió la cámara. Puedes activarla de nuevo."
                            );
                        }
                    });
                });

                animacion = requestAnimationFrame(analizar);
            } catch (error) {
                if (solicitud !== version) return;

                let mensaje = "No se pudo activar la cámara.";

                if (error.name === "NotAllowedError") {
                    mensaje =
                        "Permite la cámara en los ajustes de este sitio en Chrome.";
                } else if (error.name === "NotFoundError") {
                    mensaje =
                        "No se encontró una cámara disponible.";
                } else if (error.name === "NotReadableError") {
                    mensaje =
                        "La cámara está ocupada o no está disponible.";
                }

                detener(mensaje);
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
            if (document.hidden && (activo || iniciando)) {
                detener();
            }
        });

        if ("IntersectionObserver" in window) {
            const observador = new IntersectionObserver((entradas) => {
                for (const entrada of entradas) {
                    if (
                        !entrada.isIntersecting &&
                        (activo || iniciando)
                    ) {
                        detener();
                    }
                }
            });

            observador.observe(seccion);
        }

        window.addEventListener("pagehide", () => detener());
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciarControlCamara,
            { once: true }
        );
    } else {
        iniciarControlCamara();
    }
})();