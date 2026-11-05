# dsh-rightbar-quicknav

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c78ff)](https://github.com/deepseek-ai/deepseek-harness)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Navegación rápida para la barra lateral derecha de DeepSeek Harness (DSH): un riel vertical de iconos que lleva directamente a cualquier pestaña lateral derecha.**

> [English](README.md) · [简体中文](README-zh.md) · [日本語](README-ja.md) · Español · [Português](README-pt.md) · [हिन्दी](README-hi.md)

## Qué resuelve

DSH agrupa cada función de la barra lateral derecha (Archivos, Git, Tareas, Terminal, Navegador, Estudio de imágenes, Memoria…) en una tira de pestañas que hay que abrir primero. Este plugin añade un **riel de iconos permanente** justo debajo del botón *abrir barra lateral derecha*:

- **Plegado muestra solo 3 iconos** — apenas molesta mientras trabajas.
- **Al pasar el ratón** se despliega hacia abajo y muestra todas las pestañas disponibles.
- **Al pasar sobre un icono**, su título aparece en una burbuja compacta.
- **Al hacer clic**, la barra lateral derecha se abre directamente en esa pestaña: un clic en lugar de tres.

La lista no está escrita a mano: se lee del registro propio del host (`sidebarRightTabs.guide()`), así que **cualquier plugin que registre una pestaña aparece automáticamente en el riel**.

## Instalación

### Mediante el gestor de plugins (recomendado)

`Plugins → Añadir` y apunta a este paquete (tarball de npm o directorio local). El patch del bundle conecta la mitad cliente con el perfil Web / Desktop.

### Manual

```bash
cd ~/.dsh/profiles/<tu-perfil>
pnpm add dsh-rightbar-quicknav
```

Después **reinicia DSH por completo**: los módulos cliente se componen al arrancar, recargar la página no basta.

## Requisitos

- DSH `>= 0.2.1-rc.1` (necesita los servicios cliente `sidebarRightTabs` / `sidebarRight`)
- React lo aporta el host — **sin dependencias en tiempo de ejecución** y **sin paso de compilación**

## Detalles de comportamiento

| | |
|---|---|
| Posición | borde derecho del viewport con `10px` de margen; `50px` por debajo del botón del host |
| Plegado | 3 iconos |
| Despliegue | al pasar el ratón (se pliega 200 ms después de salir) |
| Burbuja | una sola línea, ancho automático; se voltea al otro lado si no cabe |
| Salto | `sidebarRight.openTab(kind)` |
| Oculto cuando | la barra derecha ya está abierta o no hay sesión en pantalla |

## Límites de diseño

- Se monta **solo** en el slot aditivo `shell.overlay`: nunca cubre ni reemplaza la interfaz oficial.
- Todo el aspecto va en **estilos en línea de React**: el host no expone un servicio `styles`, así que el CSS por clases no haría nada de forma silenciosa.
- La geometría es **dirigida por eventos** (`MutationObserver` + `ResizeObserver`), sin sondeo ni layout forzado en estado estable.
- El ancla es el propio botón del host, localizado por el atributo estable `data-sidebar-right-expand`, con reserva por `aria-label`; si ninguno coincide, usa una posición por defecto y registra un aviso en lugar de desaparecer o anclarse mal.
- Accesible por teclado: `toolbar` con roving tabindex y flechas, `Esc` cierra la burbuja, el contorno de foco solo aparece con teclado.
- Respeta `prefers-reduced-motion`; una excepción en el render la captura un ErrorBoundary en vez de dejar el slot en blanco.
- Los textos están en chino e inglés y se registran en el espacio `rightbarQuicknav` cuando el host ofrece servicio de locale.

## Auditoría

El plugin pasó por una auditoría completa y una ronda de correcciones; todo está en el repositorio:

- [`AUDIT-2026-11-06.md`](AUDIT-2026-11-06.md) — auditoría completa: puntuación, hallazgos, plan
- [`AUDIT-a11y.md`](AUDIT-a11y.md) — interacción y accesibilidad
- [`AUDIT-perf.md`](AUDIT-perf.md) — rendimiento y recursos
- [`AUDIT-2026-11-06-REMEDIATION.md`](AUDIT-2026-11-06-REMEDIATION.md) — verificación y registro de correcciones

## Desarrollo

```bash
node --check client.js     # comprobación de sintaxis
node --test tests/         # pruebas de humo de render (sin dependencias)
```

La prueba de humo carga el `client.js` real y recorre el propio camino `apply() → slots.inject → slots.register` con un stub mínimo de React, verificando que el render y los efectos no lancen excepciones. Existe porque un único identificador indefinido en un efecto hizo desaparecer el riel sin ningún aviso.

## Licencia

MIT
