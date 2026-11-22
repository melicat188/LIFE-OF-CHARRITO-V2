(() => {
    const saldoGemas = document.getElementById("saldo-gemas");
    const popupRuleta = document.getElementById("resultado-ruleta");
    const popupDados = document.getElementById("resultado-dados");
    const gemasDeRuleta = document.getElementById("gemas-resultado-ruleta");
    const imagenesDeDados = document.getElementById("imagenes-resultado-dados");

    if (!saldoGemas || !popupRuleta || !popupDados || !gemasDeRuleta || !imagenesDeDados) {
        return;
    }

    const saldosPorImagen = new Map();

    for (const seccion of document.querySelectorAll("[data-dado-resultado][data-saldo-gemas]")) {
        const ruta = new URL(seccion.dataset.dadoResultado, document.baseURI).href;
        const saldo = Number(seccion.dataset.saldoGemas);

        if (Number.isInteger(saldo) && saldo >= 0) {
            saldosPorImagen.set(ruta, saldo);
        }
    }

    function mostrarSaldo(cantidad) {
        const texto = cantidad === 1 ? "1 gema" : `${cantidad} gemas`;

        if (saldoGemas.textContent !== texto) {
            saldoGemas.textContent = texto;
        }
    }

    const observador = new MutationObserver((cambios) => {
        for (const { target: popup } of cambios) {
            if (!popup.open) continue;

            if (popup === popupRuleta) {
                const cantidad = gemasDeRuleta.querySelectorAll("img").length;

                if (cantidad > 0) mostrarSaldo(cantidad);
                continue;
            }

            const imagen = imagenesDeDados.querySelector("img");
            const saldo = saldosPorImagen.get(imagen?.src);

            if (saldo !== undefined) mostrarSaldo(saldo);
        }
    });

    const opciones = { attributes: true, attributeFilter: ["open"] };
    observador.observe(popupRuleta, opciones);
    observador.observe(popupDados, opciones);
})();