module.exports = {
  options: {
    // Deno usa imports con extensión .ts
    doNotFollow: { path: "node_modules" },
  },

  forbidden: [

    // ============================================================
    // 1. EDGE FUNCTIONS
    // ============================================================

    {
      name: "funcion-edge-no-puede-depender-de-otra-edge-function",
      comment:
        "Una Edge Function no debe depender de otra Edge Function. " +
        "La comunicación entre capacidades debe hacerse mediante contratos, " +
        "infraestructura compartida o mecanismos externos.",
      severity: "error",

      from: {
        path: "^functions/(?!_shared/)([^/]+)/",
      },

      to: {
        path: "^functions/(?!_shared/)([^/]+)/",
        pathNot: "^functions/(?!_shared/)$1/"
      },
    },


    // ============================================================
    // 2. CORE NO CONOCE LOS MÓDULOS DE NEGOCIO
    // ============================================================

    {
      name: "core no depende de módulos de negocio",
      comment:
        "Core es infraestructura transversal. No puede conocer módulos de negocio.",
      severity: "error",

      from: {
        path: "^functions/_shared/core/",
      },

      to: {
        path: "^functions/_shared/modules/",
      },
    },


    // ============================================================
    // 3. CORE NO CONOCE LAS EDGE FUNCTIONS
    // ============================================================

    {
      name: "core-no-depende-de-edge-functions",
      severity: "error",

      from: {
        path: "^functions/_shared/core/",
      },

      to: {
        path: "^functions/(?!_shared/)",
      },
    },


    // ============================================================
    // 4. DOMAIN NO PUEDE DEPENDER DE INFRASTRUCTURE
    // ============================================================

    {
      name: "dominio-no-depende-de-infraestructura",
      comment:
        "El dominio debe permanecer independiente de Supabase, SMTP, HTTP, etc.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/[^/]+/domain/",
      },

      to: {
        path: "^functions/_shared/modules/[^/]+/infrastructure/",
      },
    },


    // ============================================================
    // 5. DOMAIN NO PUEDE DEPENDER DE APPLICATION
    // ============================================================

    {
      name: "dominio-no-depende-de-aplicación",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/[^/]+/domain/",
      },

      to: {
        path: "^functions/_shared/modules/[^/]+/application/",
      },
    },


    // ============================================================
    // 6. DOMAIN NO PUEDE DEPENDER DE CORE
    // ============================================================

    {
      name: "dominio-no-depende-de-core",
      comment:
        "El dominio no debe conocer implementaciones técnicas compartidas.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/[^/]+/domain/",
      },

      to: {
        path: "^functions/_shared/core/",
      },
    },


    // ============================================================
    // 7. APPLICATION NO PUEDE DEPENDER DE INFRASTRUCTURE
    // ============================================================

    {
      name: "aplicacion-no-depende-de-infraestructura",
      comment:
        "Application debe depender de puertos/interfaces, no de repositorios concretos.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/[^/]+/application/",
      },

      to: {
        path: "^functions/_shared/modules/[^/]+/infrastructure/",
      },
    },


    // ============================================================
    // 8. APPLICATION NO PUEDE DEPENDER DE CORE TÉCNICO
    // ============================================================

    {
      name: "aplicacion-no-depende-de-core-tecnico",
      comment:
        "Los casos de uso no deben conocer SMTP, Supabase, CORS ni otras implementaciones técnicas.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/[^/]+/application/",
      },

      to: {
        path:
          "^functions/_shared/core/(mailer|supabase|cors)\\.ts$",
      },
    },


    // ============================================================
    // 9. INFRASTRUCTURE PUEDE USAR CORE
    //
    // No es una forbidden rule:
    // esto queda PERMITIDO.
    //
    // infrastructure → core
    // ============================================================


    // ============================================================
    // 10. CORE TÉCNICO NO DEBE SER CONSUMIDO INTERNAMENTE
    //     POR OTROS MÓDULOS MEDIANTE ARCHIVOS PROFUNDOS
    // ============================================================

    {
      name: "core-tecnico-no-consumido-internamente",
      comment:
        "El acceso a core debe realizarse mediante su API pública.",
      severity: "warn",

      from: {
        pathNot: "^functions/_shared/core/",
      },

      to: {
        path: "^functions/_shared/core/(?!index\\.ts$).+",
      },
    },


    // ============================================================
    // 11. UN MÓDULO NO PUEDE ACCEDER A INFRASTRUCTURE DE OTRO
    // ============================================================

    {
      name: "modulo-no-puede-acceder-a-infraestructura-de-otro-modulo",
      comment:
        "La infraestructura pertenece exclusivamente a su módulo.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/([^/]+)/"
      },

      to: {
        path: "^functions/_shared/modules/[^/]+/infrastructure/",
        pathNot: "^functions/_shared/modules/$1/infrastructure/"
      },
    },


    // ============================================================
    // 12. UN MÓDULO NO PUEDE ACCEDER AL DOMAIN DE OTRO MÓDULO
    // ============================================================

    {
      name: "modulo-no-puede-acceder-al-domain-de-otro-modulo",
      comment:
        "Los detalles internos del dominio de un módulo no son una API pública.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/([^/]+)/",
      },

      to: {
        path: "^functions/_shared/modules/[^/]+/domain/",
        pathNot: "^functions/_shared/modules/$1/domain/"
      },
    },


    // ============================================================
    // 13. UN MÓDULO NO PUEDE ACCEDER AL APPLICATION DE OTRO
    // ============================================================

    {
      name: "modulo-no-puede-acceder-al-application-de-otro-modulo",
      comment:
        "Los casos de uso de un módulo no deben ser utilizados directamente por otro módulo.",
      severity: "error",

      from: {
        path: "^functions/_shared/modules/([^/]+)/",
      },

      to: {
        path: "^functions/_shared/modules/[^/]+/application/",
        pathNot: "^functions/_shared/modules/$1/application/"
      },
    },


    // ============================================================
    // 14. BARREL / PUBLIC API DE MÓDULOS
    // ============================================================

    {
      name: "barrel-public-api-de-modulos",
      comment:
        "Fuera de su propio módulo, domain/application/infrastructure " +
        "no deben consumirse mediante imports profundos.",
      severity: "error",

      from: {
        path: "^functions/(?!_shared/modules/[^/]+/)(.+)",
      },

      to: {
        path:
          "^functions/_shared/modules/[^/]+/(domain|application|infrastructure)/",
      },
    },

  ],
};