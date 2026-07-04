export const STRINGS = {
  modes: {
    mode1: "Flujo 2D",
    mode2: "Gradientes 3D",
    mode3: "Deformación",
  },
  fields: {
    picker: "Campo vectorial",
    "vortex-rotacional": "Vórtice Rotacional",
    "expansion-radial": "Expansión Radial",
    "flujo-cortante": "Flujo Cortante",
    "punto-de-silla": "Punto de Silla",
    "vortice-con-fuente": "Vórtice con Fuente",
    "reticula-periodica": "Retícula Periódica",
  },
  math: {
    toggle: "Modo matemático",
    lineIntegral: "\u222e F \u00b7 dr",
    surfaceIntegral: "\u222c (\u2207 \u00d7 F) \u00b7 dS",
  },
  controls: {
    particleDensity: "Densidad de partículas",
    streamlines: "Líneas de flujo",
    resetView: "Restablecer vista",
    uploadImage: "Subir imagen",
    effectsToggle: "Efectos activados",
  },
  errors: {
    fileTooBig: "Archivo demasiado grande (máx. 20 MB)",
    unsupportedFormat: "Formato no soportado",
    loadFailed: "No se pudo cargar la imagen",
  },
} as const;
