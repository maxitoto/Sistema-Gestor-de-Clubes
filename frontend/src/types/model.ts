export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          arancel_mensual: number
          created_at: string | null
          deporte_id: string
          edad_max: number | null
          edad_min: number | null
          estado: Database["public"]["Enums"]["estado_basico"]
          id: string
          nombre: string
        }
        Insert: {
          arancel_mensual: number
          created_at?: string | null
          deporte_id: string
          edad_max?: number | null
          edad_min?: number | null
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre: string
        }
        Update: {
          arancel_mensual?: number
          created_at?: string | null
          deporte_id?: string
          edad_max?: number | null
          edad_min?: number | null
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_deporte_id_fkey"
            columns: ["deporte_id"]
            isOneToOne: false
            referencedRelation: "deportes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_gasto: {
        Row: {
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_basico"]
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      club: {
        Row: {
          certificado_arca: string | null
          certificado_key: string | null
          certificado_vencimiento: string | null
          cuit: string
          domicilio_fiscal: string
          id: string
          logo_url: string | null
          nombre: string
          punto_venta: number
          updated_at: string | null
        }
        Insert: {
          certificado_arca?: string | null
          certificado_key?: string | null
          certificado_vencimiento?: string | null
          cuit: string
          domicilio_fiscal: string
          id?: string
          logo_url?: string | null
          nombre: string
          punto_venta: number
          updated_at?: string | null
        }
        Update: {
          certificado_arca?: string | null
          certificado_key?: string | null
          certificado_vencimiento?: string | null
          cuit?: string
          domicilio_fiscal?: string
          id?: string
          logo_url?: string | null
          nombre?: string
          punto_venta?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      comprobantes: {
        Row: {
          cae: string | null
          cae_vencimiento: string | null
          created_at: string | null
          estado_fiscal: Database["public"]["Enums"]["estado_fiscal"]
          id: string
          motivo_anulacion: string | null
          numero_comprobante: string | null
          pago_id: string
          pdf_url: string | null
          tipo: Database["public"]["Enums"]["tipo_comprobante"]
        }
        Insert: {
          cae?: string | null
          cae_vencimiento?: string | null
          created_at?: string | null
          estado_fiscal?: Database["public"]["Enums"]["estado_fiscal"]
          id?: string
          motivo_anulacion?: string | null
          numero_comprobante?: string | null
          pago_id: string
          pdf_url?: string | null
          tipo: Database["public"]["Enums"]["tipo_comprobante"]
        }
        Update: {
          cae?: string | null
          cae_vencimiento?: string | null
          created_at?: string | null
          estado_fiscal?: Database["public"]["Enums"]["estado_fiscal"]
          id?: string
          motivo_anulacion?: string | null
          numero_comprobante?: string | null
          pago_id?: string
          pdf_url?: string | null
          tipo?: Database["public"]["Enums"]["tipo_comprobante"]
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      cuota_job_logs: {
        Row: {
          cuotas_generadas: number | null
          cuotas_omitidas: number | null
          estado: Database["public"]["Enums"]["estado_job"]
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          periodo_anio: number
          periodo_mes: number
        }
        Insert: {
          cuotas_generadas?: number | null
          cuotas_omitidas?: number | null
          estado?: Database["public"]["Enums"]["estado_job"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          periodo_anio: number
          periodo_mes: number
        }
        Update: {
          cuotas_generadas?: number | null
          cuotas_omitidas?: number | null
          estado?: Database["public"]["Enums"]["estado_job"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          periodo_anio?: number
          periodo_mes?: number
        }
        Relationships: []
      }
      cuotas: {
        Row: {
          categoria_id: string
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_cuota"]
          id: string
          monto: number
          periodo_anio: number
          periodo_mes: number
          socio_id: string
          updated_at: string | null
        }
        Insert: {
          categoria_id: string
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_cuota"]
          id?: string
          monto: number
          periodo_anio: number
          periodo_mes: number
          socio_id: string
          updated_at?: string | null
        }
        Update: {
          categoria_id?: string
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_cuota"]
          id?: string
          monto?: number
          periodo_anio?: number
          periodo_mes?: number
          socio_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuotas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotas_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      deportes: {
        Row: {
          created_at: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_basico"]
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          asunto: string
          cuerpo: string
          destinatarios_count: number
          estado: Database["public"]["Enums"]["estado_email"]
          fecha_envio: string
          id: string
          plantilla_id: string | null
          usuario_id: string
        }
        Insert: {
          asunto: string
          cuerpo: string
          destinatarios_count?: number
          estado?: Database["public"]["Enums"]["estado_email"]
          fecha_envio?: string
          id?: string
          plantilla_id?: string | null
          usuario_id: string
        }
        Update: {
          asunto?: string
          cuerpo?: string
          destinatarios_count?: number
          estado?: Database["public"]["Enums"]["estado_email"]
          fecha_envio?: string
          id?: string
          plantilla_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas_correo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria_id: string
          concepto: string
          created_at: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_gasto"]
          evidencia_url: string | null
          fecha: string
          id: string
          metodo_pago: Database["public"]["Enums"]["medio_pago"]
          monto: number
          motivo_anulacion: string | null
          referencia_banco: string | null
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          categoria_id: string
          concepto: string
          created_at?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_gasto"]
          evidencia_url?: string | null
          fecha?: string
          id?: string
          metodo_pago: Database["public"]["Enums"]["medio_pago"]
          monto: number
          motivo_anulacion?: string | null
          referencia_banco?: string | null
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          categoria_id?: string
          concepto?: string
          created_at?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_gasto"]
          evidencia_url?: string | null
          fecha?: string
          id?: string
          metodo_pago?: Database["public"]["Enums"]["medio_pago"]
          monto?: number
          motivo_anulacion?: string | null
          referencia_banco?: string | null
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inscripciones: {
        Row: {
          categoria_id: string
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_inscripcion"]
          fecha_alta: string
          fecha_baja: string | null
          id: string
          socio_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_inscripcion"]
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          socio_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_inscripcion"]
          fecha_alta?: string
          fecha_baja?: string | null
          id?: string
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inscripciones_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          created_at: string | null
          cuota_id: string
          estado: Database["public"]["Enums"]["estado_pago"]
          fecha_pago: string
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto: number
          referencia_pago: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          cuota_id: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          fecha_pago?: string
          id?: string
          medio_pago: Database["public"]["Enums"]["medio_pago"]
          monto: number
          referencia_pago?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          cuota_id?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          fecha_pago?: string
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"]
          monto?: number
          referencia_pago?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas_correo: {
        Row: {
          asunto: string
          created_at: string | null
          cuerpo: string
          estado: Database["public"]["Enums"]["estado_basico"]
          id: string
          nombre_interno: string
          updated_at: string | null
        }
        Insert: {
          asunto: string
          created_at?: string | null
          cuerpo: string
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre_interno: string
          updated_at?: string | null
        }
        Update: {
          asunto?: string
          created_at?: string | null
          cuerpo?: string
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre_interno?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      socios: {
        Row: {
          acepta_comunicaciones: boolean
          apellido: string
          contacto_emergencia_nombre: string | null
          contacto_emergencia_telefono: string | null
          created_at: string | null
          direccion: string | null
          dni: string
          email: string | null
          email_invalido: boolean
          estado: Database["public"]["Enums"]["estado_basico"]
          fecha_alta: string
          fecha_baja: string | null
          fecha_nacimiento: string
          foto_url: string | null
          id: string
          nombre: string
          numero_socio: number
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          acepta_comunicaciones?: boolean
          apellido: string
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string | null
          direccion?: string | null
          dni: string
          email?: string | null
          email_invalido?: boolean
          estado?: Database["public"]["Enums"]["estado_basico"]
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_nacimiento: string
          foto_url?: string | null
          id?: string
          nombre: string
          numero_socio?: number
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          acepta_comunicaciones?: boolean
          apellido?: string
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string | null
          direccion?: string | null
          dni?: string
          email?: string | null
          email_invalido?: boolean
          estado?: Database["public"]["Enums"]["estado_basico"]
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string
          foto_url?: string | null
          id?: string
          nombre?: string
          numero_socio?: number
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          apellido: string
          created_at: string | null
          email: string
          estado: Database["public"]["Enums"]["estado_basico"]
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          updated_at: string | null
        }
        Insert: {
          apellido: string
          created_at?: string | null
          email: string
          estado?: Database["public"]["Enums"]["estado_basico"]
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string | null
        }
        Update: {
          apellido?: string
          created_at?: string | null
          email?: string
          estado?: Database["public"]["Enums"]["estado_basico"]
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      flujo_caja: {
        Row: {
          concepto: string | null
          estado: string | null
          fecha: string | null
          metodo: Database["public"]["Enums"]["medio_pago"] | null
          monto_positivo: number | null
          movimiento_id: string | null
          referencia: string | null
          tipo_movimiento: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      estado_basico: "activo" | "inactivo"
      estado_cuota: "pendiente" | "pagada" | "anulada"
      estado_email: "enviado" | "fallido" | "procesando"
      estado_fiscal:
        | "valido"
        | "pendiente_cae"
        | "anulacion_pendiente"
        | "fallido"
      estado_gasto: "activo" | "anulado"
      estado_inscripcion: "activa" | "inactiva"
      estado_job: "procesando" | "exitoso" | "fallido"
      estado_pago: "completado" | "anulado"
      medio_pago: "efectivo" | "transferencia"
      rol_usuario: "admin" | "responsable"
      tipo_comprobante: "factura" | "nota_credito"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_basico: ["activo", "inactivo"],
      estado_cuota: ["pendiente", "pagada", "anulada"],
      estado_email: ["enviado", "fallido", "procesando"],
      estado_fiscal: [
        "valido",
        "pendiente_cae",
        "anulacion_pendiente",
        "fallido",
      ],
      estado_gasto: ["activo", "anulado"],
      estado_inscripcion: ["activa", "inactiva"],
      estado_job: ["procesando", "exitoso", "fallido"],
      estado_pago: ["completado", "anulado"],
      medio_pago: ["efectivo", "transferencia"],
      rol_usuario: ["admin", "responsable"],
      tipo_comprobante: ["factura", "nota_credito"],
    },
  },
} as const

