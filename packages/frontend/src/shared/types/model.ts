export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	graphql_public: {
		Tables: {
			[_ in never]: never;
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			graphql: {
				Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
				Returns: Json;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
	public: {
		Tables: {
			categorias: {
				Row: {
					arancel_mensual: number;
					created_at: string | null;
					deporte_id: string;
					edad_max: number | null;
					edad_min: number | null;
					estado: Database['public']['Enums']['estado_basico'];
					id: string;
					nombre: string;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					arancel_mensual: number;
					created_at?: string | null;
					deporte_id: string;
					edad_max?: number | null;
					edad_min?: number | null;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre: string;
					updated_at?: string | null;
				};
				Update: {
					arancel_mensual?: number;
					created_at?: string | null;
					deporte_id?: string;
					edad_max?: number | null;
					edad_min?: number | null;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'categorias_deporte_id_fkey';
						columns: ['deporte_id'];
						isOneToOne: false;
						referencedRelation: 'deportes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'categorias_deporte_id_fkey';
						columns: ['deporte_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['deporte_id'];
					},
					{
						foreignKeyName: 'categorias_deporte_id_fkey';
						columns: ['deporte_id'];
						isOneToOne: false;
						referencedRelation: 'v_morosidad_por_deporte';
						referencedColumns: ['deporte_id'];
					},
					{
						foreignKeyName: 'categorias_deporte_id_fkey';
						columns: ['deporte_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['deporte_id'];
					},
				];
			};
			categorias_gasto: {
				Row: {
					created_at: string | null;
					descripcion: string | null;
					estado: Database['public']['Enums']['estado_basico'];
					id: string;
					nombre: string;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string | null;
					descripcion?: string | null;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre: string;
					updated_at?: string | null;
				};
				Update: {
					created_at?: string | null;
					descripcion?: string | null;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre?: string;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			club: {
				Row: {
					certificado_arca: string | null;
					certificado_key: string | null;
					certificado_vencimiento: string | null;
					cuit: string;
					domicilio_fiscal: string;
					email_contacto: string;
					id: string;
					logo_storage_path: string | null;
					logo_url: string | null;
					nombre: string;
					punto_venta: number;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					certificado_arca?: string | null;
					certificado_key?: string | null;
					certificado_vencimiento?: string | null;
					cuit: string;
					domicilio_fiscal: string;
					email_contacto: string;
					id?: string;
					logo_storage_path?: string | null;
					logo_url?: string | null;
					nombre: string;
					punto_venta: number;
					updated_at?: string | null;
				};
				Update: {
					certificado_arca?: string | null;
					certificado_key?: string | null;
					certificado_vencimiento?: string | null;
					cuit?: string;
					domicilio_fiscal?: string;
					email_contacto?: string;
					id?: string;
					logo_storage_path?: string | null;
					logo_url?: string | null;
					nombre?: string;
					punto_venta?: number;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			comprobantes: {
				Row: {
					ambiente_fiscal: string | null;
					cae: string | null;
					cae_vencimiento: string | null;
					comprobante_origen_id: string | null;
					created_at: string | null;
					detalle_error_fiscal: string | null;
					emisor_cuit: string | null;
					estado_fiscal: Database['public']['Enums']['estado_fiscal'];
					id: string;
					intentos_reintento: number;
					motivo_anulacion: string | null;
					numero_comprobante: string | null;
					numero_solicitado: string | null;
					pago_id: string;
					pdf_url: string | null;
					proximo_reintento_en: string | null;
					punto_venta: number;
					solicitud_fiscal: Json | null;
					tipo: Database['public']['Enums']['tipo_comprobante'];
					tipo_fiscal: number | null;
					updated_at: string | null;
					ventana_regularizacion_iniciada_en: string;
				};
				ComputedFields: never;
				Insert: {
					ambiente_fiscal?: string | null;
					cae?: string | null;
					cae_vencimiento?: string | null;
					comprobante_origen_id?: string | null;
					created_at?: string | null;
					detalle_error_fiscal?: string | null;
					emisor_cuit?: string | null;
					estado_fiscal?: Database['public']['Enums']['estado_fiscal'];
					id?: string;
					intentos_reintento?: number;
					motivo_anulacion?: string | null;
					numero_comprobante?: string | null;
					numero_solicitado?: string | null;
					pago_id: string;
					pdf_url?: string | null;
					proximo_reintento_en?: string | null;
					punto_venta?: number;
					solicitud_fiscal?: Json | null;
					tipo: Database['public']['Enums']['tipo_comprobante'];
					tipo_fiscal?: number | null;
					updated_at?: string | null;
					ventana_regularizacion_iniciada_en?: string;
				};
				Update: {
					ambiente_fiscal?: string | null;
					cae?: string | null;
					cae_vencimiento?: string | null;
					comprobante_origen_id?: string | null;
					created_at?: string | null;
					detalle_error_fiscal?: string | null;
					emisor_cuit?: string | null;
					estado_fiscal?: Database['public']['Enums']['estado_fiscal'];
					id?: string;
					intentos_reintento?: number;
					motivo_anulacion?: string | null;
					numero_comprobante?: string | null;
					numero_solicitado?: string | null;
					pago_id?: string;
					pdf_url?: string | null;
					proximo_reintento_en?: string | null;
					punto_venta?: number;
					solicitud_fiscal?: Json | null;
					tipo?: Database['public']['Enums']['tipo_comprobante'];
					tipo_fiscal?: number | null;
					updated_at?: string | null;
					ventana_regularizacion_iniciada_en?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'comprobantes_comprobante_origen_id_fkey';
						columns: ['comprobante_origen_id'];
						isOneToOne: false;
						referencedRelation: 'comprobantes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'comprobantes_comprobante_origen_id_fkey';
						columns: ['comprobante_origen_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['comprobante_id'];
					},
					{
						foreignKeyName: 'comprobantes_comprobante_origen_id_fkey';
						columns: ['comprobante_origen_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['comprobante_id'];
					},
					{
						foreignKeyName: 'comprobantes_comprobante_origen_id_fkey';
						columns: ['comprobante_origen_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_etiqueta_fiscal';
						referencedColumns: ['comprobante_id'];
					},
					{
						foreignKeyName: 'comprobantes_pago_id_fkey';
						columns: ['pago_id'];
						isOneToOne: false;
						referencedRelation: 'pagos';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'comprobantes_pago_id_fkey';
						columns: ['pago_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['pago_id'];
					},
					{
						foreignKeyName: 'comprobantes_pago_id_fkey';
						columns: ['pago_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'comprobantes_pago_id_fkey';
						columns: ['pago_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['pago_id'];
					},
					{
						foreignKeyName: 'comprobantes_pago_id_fkey';
						columns: ['pago_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_etiqueta_fiscal';
						referencedColumns: ['id'];
					},
				];
			};
			cuota_job_logs: {
				Row: {
					cuotas_generadas: number | null;
					cuotas_omitidas: number | null;
					estado: Database['public']['Enums']['estado_job'];
					fecha_fin: string | null;
					fecha_inicio: string;
					id: string;
					periodo_anio: number;
					periodo_mes: number;
				};
				ComputedFields: never;
				Insert: {
					cuotas_generadas?: number | null;
					cuotas_omitidas?: number | null;
					estado?: Database['public']['Enums']['estado_job'];
					fecha_fin?: string | null;
					fecha_inicio?: string;
					id?: string;
					periodo_anio: number;
					periodo_mes: number;
				};
				Update: {
					cuotas_generadas?: number | null;
					cuotas_omitidas?: number | null;
					estado?: Database['public']['Enums']['estado_job'];
					fecha_fin?: string | null;
					fecha_inicio?: string;
					id?: string;
					periodo_anio?: number;
					periodo_mes?: number;
				};
				Relationships: [];
			};
			cuotas: {
				Row: {
					categoria_id: string;
					created_at: string | null;
					estado: Database['public']['Enums']['estado_cuota'];
					id: string;
					monto: number;
					periodo_anio: number;
					periodo_mes: number;
					socio_id: string;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					categoria_id: string;
					created_at?: string | null;
					estado?: Database['public']['Enums']['estado_cuota'];
					id?: string;
					monto: number;
					periodo_anio: number;
					periodo_mes: number;
					socio_id: string;
					updated_at?: string | null;
				};
				Update: {
					categoria_id?: string;
					created_at?: string | null;
					estado?: Database['public']['Enums']['estado_cuota'];
					id?: string;
					monto?: number;
					periodo_anio?: number;
					periodo_mes?: number;
					socio_id?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'cuotas_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'categorias';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'cuotas_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['categoria_id'];
					},
					{
						foreignKeyName: 'cuotas_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['categoria_id'];
					},
					{
						foreignKeyName: 'cuotas_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'socios';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'cuotas_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'cuotas_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'cuotas_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_etiqueta_fiscal';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'cuotas_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_socios_estado_pago';
						referencedColumns: ['id'];
					},
				];
			};
			deportes: {
				Row: {
					created_at: string | null;
					descripcion: string | null;
					estado: Database['public']['Enums']['estado_basico'];
					id: string;
					nombre: string;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					created_at?: string | null;
					descripcion?: string | null;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre: string;
					updated_at?: string | null;
				};
				Update: {
					created_at?: string | null;
					descripcion?: string | null;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre?: string;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			email_destinatarios: {
				Row: {
					aceptado_en: string | null;
					asunto_snapshot: string | null;
					created_at: string | null;
					cuerpo_snapshot: string | null;
					email: string | null;
					email_log_id: string;
					entrega_estado: string;
					estado: Database['public']['Enums']['estado_email'];
					estado_envio: string;
					id: string;
					motivo: string | null;
					proveedor: string | null;
					provider_message_id: string | null;
					reserva_id: string | null;
					reservado_en: string | null;
					socio_id: string | null;
				};
				ComputedFields: never;
				Insert: {
					aceptado_en?: string | null;
					asunto_snapshot?: string | null;
					created_at?: string | null;
					cuerpo_snapshot?: string | null;
					email?: string | null;
					email_log_id: string;
					entrega_estado?: string;
					estado?: Database['public']['Enums']['estado_email'];
					estado_envio?: string;
					id?: string;
					motivo?: string | null;
					proveedor?: string | null;
					provider_message_id?: string | null;
					reserva_id?: string | null;
					reservado_en?: string | null;
					socio_id?: string | null;
				};
				Update: {
					aceptado_en?: string | null;
					asunto_snapshot?: string | null;
					created_at?: string | null;
					cuerpo_snapshot?: string | null;
					email?: string | null;
					email_log_id?: string;
					entrega_estado?: string;
					estado?: Database['public']['Enums']['estado_email'];
					estado_envio?: string;
					id?: string;
					motivo?: string | null;
					proveedor?: string | null;
					provider_message_id?: string | null;
					reserva_id?: string | null;
					reservado_en?: string | null;
					socio_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'email_destinatarios_email_log_id_fkey';
						columns: ['email_log_id'];
						isOneToOne: false;
						referencedRelation: 'email_logs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'email_destinatarios_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'socios';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'email_destinatarios_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'email_destinatarios_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'email_destinatarios_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_etiqueta_fiscal';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'email_destinatarios_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_socios_estado_pago';
						referencedColumns: ['id'];
					},
				];
			};
			email_eventos: {
				Row: {
					bounce_tipo: string | null;
					destinatario_id: string | null;
					event_id: string;
					ocurrido_en: string;
					proveedor: string;
					provider_message_id: string;
					recibido_en: string;
					tipo: string;
				};
				ComputedFields: never;
				Insert: {
					bounce_tipo?: string | null;
					destinatario_id?: string | null;
					event_id: string;
					ocurrido_en: string;
					proveedor?: string;
					provider_message_id: string;
					recibido_en?: string;
					tipo: string;
				};
				Update: {
					bounce_tipo?: string | null;
					destinatario_id?: string | null;
					event_id?: string;
					ocurrido_en?: string;
					proveedor?: string;
					provider_message_id?: string;
					recibido_en?: string;
					tipo?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'email_eventos_destinatario_id_fkey';
						columns: ['destinatario_id'];
						isOneToOne: false;
						referencedRelation: 'email_destinatarios';
						referencedColumns: ['id'];
					},
				];
			};
			email_logs: {
				Row: {
					asunto: string;
					cuerpo: string;
					destinatarios_count: number;
					estado: Database['public']['Enums']['estado_email'];
					fecha_envio: string;
					id: string;
					incluir_desuscriptos: boolean;
					origen: string;
					plantilla_id: string | null;
					request_id: string | null;
					solicitud: Json | null;
					tipo: string;
					usuario_id: string | null;
				};
				ComputedFields: never;
				Insert: {
					asunto: string;
					cuerpo: string;
					destinatarios_count?: number;
					estado?: Database['public']['Enums']['estado_email'];
					fecha_envio?: string;
					id?: string;
					incluir_desuscriptos?: boolean;
					origen?: string;
					plantilla_id?: string | null;
					request_id?: string | null;
					solicitud?: Json | null;
					tipo?: string;
					usuario_id?: string | null;
				};
				Update: {
					asunto?: string;
					cuerpo?: string;
					destinatarios_count?: number;
					estado?: Database['public']['Enums']['estado_email'];
					fecha_envio?: string;
					id?: string;
					incluir_desuscriptos?: boolean;
					origen?: string;
					plantilla_id?: string | null;
					request_id?: string | null;
					solicitud?: Json | null;
					tipo?: string;
					usuario_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'email_logs_plantilla_id_fkey';
						columns: ['plantilla_id'];
						isOneToOne: false;
						referencedRelation: 'plantillas_correo';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'email_logs_usuario_id_fkey';
						columns: ['usuario_id'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			gastos: {
				Row: {
					anulado_at: string | null;
					anulado_por: string | null;
					categoria_id: string;
					concepto: string;
					created_at: string;
					descripcion: string | null;
					estado: Database['public']['Enums']['estado_gasto'];
					evidencia_storage_path: string | null;
					evidencia_url: string | null;
					fecha: string;
					id: string;
					metodo_pago: Database['public']['Enums']['medio_pago'];
					monto: number;
					motivo_anulacion: string | null;
					referencia_banco: string | null;
					updated_at: string;
					usuario_id: string;
				};
				ComputedFields: never;
				Insert: {
					anulado_at?: string | null;
					anulado_por?: string | null;
					categoria_id: string;
					concepto: string;
					created_at?: string;
					descripcion?: string | null;
					estado?: Database['public']['Enums']['estado_gasto'];
					evidencia_storage_path?: string | null;
					evidencia_url?: string | null;
					fecha?: string;
					id?: string;
					metodo_pago: Database['public']['Enums']['medio_pago'];
					monto: number;
					motivo_anulacion?: string | null;
					referencia_banco?: string | null;
					updated_at?: string;
					usuario_id: string;
				};
				Update: {
					anulado_at?: string | null;
					anulado_por?: string | null;
					categoria_id?: string;
					concepto?: string;
					created_at?: string;
					descripcion?: string | null;
					estado?: Database['public']['Enums']['estado_gasto'];
					evidencia_storage_path?: string | null;
					evidencia_url?: string | null;
					fecha?: string;
					id?: string;
					metodo_pago?: Database['public']['Enums']['medio_pago'];
					monto?: number;
					motivo_anulacion?: string | null;
					referencia_banco?: string | null;
					updated_at?: string;
					usuario_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'gastos_anulado_por_fkey';
						columns: ['anulado_por'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'gastos_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'categorias_gasto';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'gastos_usuario_id_fkey';
						columns: ['usuario_id'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			inscripciones: {
				Row: {
					categoria_id: string;
					created_at: string | null;
					estado: Database['public']['Enums']['estado_inscripcion'];
					fecha_alta: string;
					fecha_baja: string | null;
					id: string;
					socio_id: string;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					categoria_id: string;
					created_at?: string | null;
					estado?: Database['public']['Enums']['estado_inscripcion'];
					fecha_alta?: string;
					fecha_baja?: string | null;
					id?: string;
					socio_id: string;
					updated_at?: string | null;
				};
				Update: {
					categoria_id?: string;
					created_at?: string | null;
					estado?: Database['public']['Enums']['estado_inscripcion'];
					fecha_alta?: string;
					fecha_baja?: string | null;
					id?: string;
					socio_id?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'inscripciones_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'categorias';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'inscripciones_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['categoria_id'];
					},
					{
						foreignKeyName: 'inscripciones_categoria_id_fkey';
						columns: ['categoria_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['categoria_id'];
					},
					{
						foreignKeyName: 'inscripciones_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'socios';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'inscripciones_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'inscripciones_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_cobranza';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'inscripciones_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_pagos_etiqueta_fiscal';
						referencedColumns: ['socio_id'];
					},
					{
						foreignKeyName: 'inscripciones_socio_id_fkey';
						columns: ['socio_id'];
						isOneToOne: false;
						referencedRelation: 'v_socios_estado_pago';
						referencedColumns: ['id'];
					},
				];
			};
			pagos: {
				Row: {
					anulado_at: string | null;
					anulado_por: string | null;
					created_at: string;
					cuota_id: string;
					estado: Database['public']['Enums']['estado_pago'];
					fecha_pago: string;
					id: string;
					medio_pago: Database['public']['Enums']['medio_pago'];
					monto: number;
					motivo_anulacion: string | null;
					referencia_pago: string | null;
					updated_at: string;
					usuario_id: string;
				};
				ComputedFields: never;
				Insert: {
					anulado_at?: string | null;
					anulado_por?: string | null;
					created_at?: string;
					cuota_id: string;
					estado?: Database['public']['Enums']['estado_pago'];
					fecha_pago?: string;
					id?: string;
					medio_pago: Database['public']['Enums']['medio_pago'];
					monto: number;
					motivo_anulacion?: string | null;
					referencia_pago?: string | null;
					updated_at?: string;
					usuario_id: string;
				};
				Update: {
					anulado_at?: string | null;
					anulado_por?: string | null;
					created_at?: string;
					cuota_id?: string;
					estado?: Database['public']['Enums']['estado_pago'];
					fecha_pago?: string;
					id?: string;
					medio_pago?: Database['public']['Enums']['medio_pago'];
					monto?: number;
					motivo_anulacion?: string | null;
					referencia_pago?: string | null;
					updated_at?: string;
					usuario_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'pagos_anulado_por_fkey';
						columns: ['anulado_por'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'cuotas';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['cuota_id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_usuario_id_fkey';
						columns: ['usuario_id'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			plantillas_correo: {
				Row: {
					asunto: string;
					created_at: string | null;
					cuerpo: string;
					estado: Database['public']['Enums']['estado_basico'];
					id: string;
					nombre_interno: string;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					asunto: string;
					created_at?: string | null;
					cuerpo: string;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre_interno: string;
					updated_at?: string | null;
				};
				Update: {
					asunto?: string;
					created_at?: string | null;
					cuerpo?: string;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre_interno?: string;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			socios: {
				Row: {
					acepta_comunicaciones: boolean;
					apellido: string;
					contacto_emergencia_nombre: string | null;
					contacto_emergencia_telefono: string | null;
					created_at: string | null;
					direccion: string | null;
					dni: string;
					dni_anterior: string | null;
					dni_corregido_at: string | null;
					dni_corregido_por: string | null;
					email: string | null;
					email_invalido: boolean;
					estado: Database['public']['Enums']['estado_basico'];
					fecha_alta: string;
					fecha_baja: string | null;
					fecha_nacimiento: string;
					foto_storage_path: string | null;
					foto_url: string | null;
					id: string;
					nombre: string;
					numero_socio: number;
					telefono: string | null;
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					acepta_comunicaciones?: boolean;
					apellido: string;
					contacto_emergencia_nombre?: string | null;
					contacto_emergencia_telefono?: string | null;
					created_at?: string | null;
					direccion?: string | null;
					dni: string;
					dni_anterior?: string | null;
					dni_corregido_at?: string | null;
					dni_corregido_por?: string | null;
					email?: string | null;
					email_invalido?: boolean;
					estado?: Database['public']['Enums']['estado_basico'];
					fecha_alta?: string;
					fecha_baja?: string | null;
					fecha_nacimiento: string;
					foto_storage_path?: string | null;
					foto_url?: string | null;
					id?: string;
					nombre: string;
					numero_socio?: number;
					telefono?: string | null;
					updated_at?: string | null;
				};
				Update: {
					acepta_comunicaciones?: boolean;
					apellido?: string;
					contacto_emergencia_nombre?: string | null;
					contacto_emergencia_telefono?: string | null;
					created_at?: string | null;
					direccion?: string | null;
					dni?: string;
					dni_anterior?: string | null;
					dni_corregido_at?: string | null;
					dni_corregido_por?: string | null;
					email?: string | null;
					email_invalido?: boolean;
					estado?: Database['public']['Enums']['estado_basico'];
					fecha_alta?: string;
					fecha_baja?: string | null;
					fecha_nacimiento?: string;
					foto_storage_path?: string | null;
					foto_url?: string | null;
					id?: string;
					nombre?: string;
					numero_socio?: number;
					telefono?: string | null;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'socios_dni_corregido_por_fkey';
						columns: ['dni_corregido_por'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			usuarios: {
				Row: {
					apellido: string;
					created_at: string | null;
					email: string;
					estado: Database['public']['Enums']['estado_basico'];
					id: string;
					nombre: string;
					rol: Database['public']['Enums']['rol_usuario'];
					updated_at: string | null;
				};
				ComputedFields: never;
				Insert: {
					apellido: string;
					created_at?: string | null;
					email: string;
					estado?: Database['public']['Enums']['estado_basico'];
					id: string;
					nombre: string;
					rol?: Database['public']['Enums']['rol_usuario'];
					updated_at?: string | null;
				};
				Update: {
					apellido?: string;
					created_at?: string | null;
					email?: string;
					estado?: Database['public']['Enums']['estado_basico'];
					id?: string;
					nombre?: string;
					rol?: Database['public']['Enums']['rol_usuario'];
					updated_at?: string | null;
				};
				Relationships: [];
			};
		};
		Views: {
			flujo_caja: {
				Row: {
					concepto: string | null;
					es_reverso: boolean | null;
					estado: string | null;
					fecha: string | null;
					metodo: Database['public']['Enums']['medio_pago'] | null;
					monto: number | null;
					movimiento_id: string | null;
					referencia: string | null;
					tipo_movimiento: string | null;
					usuario_id: string | null;
				};
				ComputedFields: never;
				Relationships: [];
			};
			v_cuotas_cobranza: {
				Row: {
					categoria_id: string;
					categoria_nombre: string;
					comprobante_id: string | null;
					cuota_en_mora: boolean | null;
					cuota_id: string;
					deporte_id: string;
					deporte_nombre: string;
					deuda_pendiente: number | null;
					es_moroso: boolean | null;
					estado_cuota: string | null;
					estado_fiscal: string | null;
					estado_pago: string | null;
					etiqueta_recibo: string | null;
					fecha: string | null;
					fecha_pago: string | null;
					id: string;
					medio: string | null;
					monto: number;
					numero_comprobante: string | null;
					pago_id: string | null;
					periodo_anio: number;
					periodo_mes: number;
					referencia: string | null;
					socio_apellido: string;
					socio_dni: string;
					socio_estado: string | null;
					socio_id: string;
					socio_nombre: string;
					socio_numero: number;
					usuario_id: string | null;
				};
				ComputedFields: never;
				Relationships: [
					{
						foreignKeyName: 'pagos_usuario_id_fkey';
						columns: ['usuario_id'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			v_morosidad_por_deporte: {
				Row: {
					cuotas_morosas: number | null;
					deporte: string;
					deporte_id: string;
					deuda_morosa: number | null;
				};
				ComputedFields: never;
				Relationships: [];
			};
			v_pagos_cobranza: {
				Row: {
					categoria_id: string;
					categoria_nombre: string;
					comprobante_id: string;
					cuota_en_mora: boolean | null;
					cuota_id: string;
					deporte_id: string;
					deporte_nombre: string;
					deuda_pendiente: number | null;
					es_moroso: boolean | null;
					estado_cuota: string | null;
					estado_fiscal: string | null;
					estado_pago: string | null;
					etiqueta_recibo: string | null;
					fecha: string;
					fecha_pago: string;
					id: string;
					medio: string | null;
					monto: number;
					numero_comprobante: string | null;
					pago_id: string;
					periodo_anio: number;
					periodo_mes: number;
					referencia: string | null;
					socio_apellido: string;
					socio_dni: string;
					socio_estado: string | null;
					socio_id: string;
					socio_nombre: string;
					socio_numero: number;
					usuario_id: string;
				};
				ComputedFields: never;
				Relationships: [
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'cuotas';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['cuota_id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_usuario_id_fkey';
						columns: ['usuario_id'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			v_pagos_etiqueta_fiscal: {
				Row: {
					comprobante_id: string;
					cuota_id: string;
					estado_fiscal: Database['public']['Enums']['estado_fiscal'];
					estado_pago: Database['public']['Enums']['estado_pago'];
					etiqueta_recibo: string | null;
					fecha_pago: string;
					id: string;
					intentos_reintento: number;
					medio_pago: Database['public']['Enums']['medio_pago'];
					monto: number;
					numero_comprobante: string | null;
					proximo_reintento_en: string | null;
					referencia_pago: string | null;
					socio_apellido: string;
					socio_dni: string;
					socio_estado: Database['public']['Enums']['estado_basico'];
					socio_id: string;
					socio_nombre: string;
					tipo_comprobante: Database['public']['Enums']['tipo_comprobante'];
					usuario_id: string;
				};
				ComputedFields: never;
				Relationships: [
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'cuotas';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['cuota_id'];
					},
					{
						foreignKeyName: 'pagos_cuota_id_fkey';
						columns: ['cuota_id'];
						isOneToOne: false;
						referencedRelation: 'v_cuotas_cobranza';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pagos_usuario_id_fkey';
						columns: ['usuario_id'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
			v_socios_estado_pago: {
				Row: {
					acepta_comunicaciones: boolean;
					apellido: string;
					contacto_emergencia_nombre: string | null;
					contacto_emergencia_telefono: string | null;
					created_at: string | null;
					deuda_pendiente: number | null;
					direccion: string | null;
					dni: string;
					dni_anterior: string | null;
					dni_corregido_at: string | null;
					dni_corregido_por: string | null;
					email: string | null;
					email_invalido: boolean;
					es_moroso: boolean | null;
					estado: Database['public']['Enums']['estado_basico'];
					estado_pago: string | null;
					fecha_alta: string;
					fecha_baja: string | null;
					fecha_nacimiento: string;
					foto_storage_path: string | null;
					foto_url: string | null;
					id: string;
					nombre: string;
					numero_socio: number;
					pendientes_count: number | null;
					telefono: string | null;
					updated_at: string | null;
				};
				ComputedFields: never;
				Relationships: [
					{
						foreignKeyName: 'socios_dni_corregido_por_fkey';
						columns: ['dni_corregido_por'];
						isOneToOne: false;
						referencedRelation: 'usuarios';
						referencedColumns: ['id'];
					},
				];
			};
		};
		Functions: {
			acceso_limitar: {
				Args: { p_email_hash: string; p_ip_hash: string; p_tipo: string };
				Returns: boolean;
			};
			adquirir_ticket_wsaa: { Args: { p_clave: string; p_propietario: string }; Returns: Json };
			anular_gasto: { Args: { p_gasto_id: string; p_motivo: string }; Returns: undefined };
			anular_pago: { Args: { p_motivo: string; p_pago_id: string }; Returns: string };
			archivo_autorizar_carga: {
				Args: { p_entidad_id: string; p_tipo: string };
				Returns: undefined;
			};
			archivo_finalizar_descarte: {
				Args: { p_actor_id: string; p_storage_path: string };
				Returns: undefined;
			};
			archivo_registrar_validado: {
				Args: {
					p_actor_id: string;
					p_entidad_id: string;
					p_mime: string;
					p_storage_path: string;
					p_tamano: number;
					p_tipo: string;
				};
				Returns: undefined;
			};
			archivo_reservar_descarte: {
				Args: { p_actor_id: string; p_entidad_id: string; p_storage_path: string; p_tipo: string };
				Returns: undefined;
			};
			baja_categoria: { Args: { p_categoria_id: string }; Returns: undefined };
			baja_deporte: { Args: { p_deporte_id: string }; Returns: undefined };
			baja_inscripcion: { Args: { p_inscripcion_id: string }; Returns: undefined };
			baja_socio: { Args: { p_socio_id: string }; Returns: undefined };
			categoria_edad_fuera_de_rango: {
				Args: {
					p_edad_max: number;
					p_edad_min: number;
					p_fecha_alta: string;
					p_fecha_nacimiento: string;
				};
				Returns: boolean;
			};
			categorias_rango_superpuesto: {
				Args: {
					p_deporte_id: string;
					p_edad_max: number;
					p_edad_min: number;
					p_excluir_categoria?: string;
				};
				Returns: {
					categoria_id: string;
					edad_max: number;
					edad_min: number;
					nombre: string;
				}[];
			};
			cobrar_cuota: {
				Args: {
					p_cuota_id: string;
					p_medio_pago: Database['public']['Enums']['medio_pago'];
					p_referencia?: string;
					p_usuario_id: string;
				};
				Returns: string;
			};
			confirmar_inscripcion: {
				Args: { p_categoria_id: string; p_socio_id: string };
				Returns: Json;
			};
			confirmar_resultado_fiscal: {
				Args: { p_ejecucion_id: string; p_resultado: Json; p_version: number };
				Returns: Json;
			};
			consultar_alta_gasto: { Args: { p_solicitud: string }; Returns: string };
			consultar_caja: { Args: { p_criterios?: Json }; Returns: Json };
			consultar_cobranza: { Args: { p_criterios?: Json; p_vista: string }; Returns: Json };
			consultar_ejecucion_fiscal: { Args: { p_comprobante_id: string }; Returns: Json };
			consultar_monitoreo_fiscal: {
				Args: {
					p_busqueda?: string;
					p_desde?: string;
					p_estado?: string;
					p_hasta?: string;
					p_page?: number;
					p_page_size?: number;
					p_tipo?: string;
				};
				Returns: Json;
			};
			crear_comunicacion: { Args: { p_solicitud: Json }; Returns: string };
			cuit_valido: { Args: { p_cuit: string }; Returns: boolean };
			cuota_proporcional: {
				Args: {
					p_arancel: number;
					p_fecha_alta: string;
					p_periodo_anio: number;
					p_periodo_mes: number;
				};
				Returns: number;
			};
			cuotas_del_periodo: {
				Args: { p_anio: number; p_mes: number; p_socio_id: string };
				Returns: {
					categoria_id: string;
					categoria_nombre: string;
					cuota_id: string;
					estado: Database['public']['Enums']['estado_cuota'];
					monto: number;
				}[];
			};
			desuscribir_correo: { Args: { p_destinatario: string }; Returns: undefined };
			es_socio_moroso: { Args: { p_socio_id: string }; Returns: boolean };
			expirar_comprobante_fiscal: { Args: { p_comprobante_id: string }; Returns: Json };
			fecha_actual_club: { Args: Record<PropertyKey, never>; Returns: string };
			finalizar_correo: {
				Args: {
					p_estado: string;
					p_id: string;
					p_message_id: string;
					p_motivo: string;
					p_reserva: string;
				};
				Returns: undefined;
			};
			generar_cuotas_mes_actual: { Args: Record<PropertyKey, never>; Returns: Json };
			generar_cuotas_mes_manual: { Args: Record<PropertyKey, never>; Returns: Json };
			guardar_ticket_wsaa: {
				Args: {
					p_clave: string;
					p_propietario: string;
					p_sobre: string;
					p_vencimiento: string;
					p_version: number;
				};
				Returns: undefined;
			};
			iniciar_ejecucion_fiscal: {
				Args: { p_comprobante_id: string; p_ejecucion_id: string; p_modo: string };
				Returns: Json;
			};
			iniciar_ejecucion_fiscal_administrativa: {
				Args: {
					p_actor_id: string;
					p_comprobante_id: string;
					p_ejecucion_id: string;
					p_modo: string;
				};
				Returns: Json;
			};
			leer_contexto_fiscal: { Args: { p_comprobante_id: string }; Returns: Json };
			listar_candidatos_fiscales: { Args: { p_limite?: number }; Returns: Json };
			marcar_envio_fiscal: { Args: { p_ejecucion_id: string; p_version: number }; Returns: Json };
			preparar_solicitud_fiscal: {
				Args: { p_ejecucion_id: string; p_numero: string; p_solicitud: Json; p_version: number };
				Returns: Json;
			};
			previsualizar_inscripcion: {
				Args: { p_categoria_id: string; p_socio_id: string };
				Returns: {
					advertencia_edad: boolean;
					edad_socio_anios: number;
					monto_proporcional: number;
					rango_max: number;
					rango_min: number;
					tramo_pct: number;
				}[];
			};
			reabrir_regularizacion_fiscal: { Args: { p_comprobante_id: string }; Returns: undefined };
			reabrir_sin_envio_fiscal: {
				Args: {
					p_actor_id: string;
					p_comprobante_id: string;
					p_ejecucion_id: string;
					p_version: number;
				};
				Returns: Json;
			};
			reabrir_verificado_fiscal: {
				Args: {
					p_actor_id?: string;
					p_comprobante_id: string;
					p_ejecucion_id?: string;
					p_version?: number;
				};
				Returns: Json;
			};
			reactivar_socio: { Args: { p_socio_id: string }; Returns: undefined };
			registrar_autorizacion_verificada_fiscal: {
				Args: {
					p_actor_id: string;
					p_comprobante_id: string;
					p_ejecucion_id: string;
					p_resultado: Json;
					p_version: number;
				};
				Returns: Json;
			};
			registrar_evento_correo: {
				Args: {
					p_bounce_tipo?: string;
					p_event_id: string;
					p_message_id: string;
					p_ocurrido: string;
					p_tipo: string;
				};
				Returns: undefined;
			};
			registrar_gasto_idempotente: {
				Args: { p_datos: Json; p_solicitud: string };
				Returns: string;
			};
			registrar_incidencia_fiscal: {
				Args: { p_ejecucion_id: string; p_motivo: string; p_version: number };
				Returns: Json;
			};
			registrar_pdf_comprobante: {
				Args: {
					p_comprobante_id: string;
					p_fuente_esperada: Json;
					p_storage_path: string;
					p_tipo_version: string;
				};
				Returns: Json;
			};
			reservar_correos: {
				Args: { p_proveedor: string };
				Returns: {
					aceptado_en: string | null;
					asunto_snapshot: string | null;
					created_at: string | null;
					cuerpo_snapshot: string | null;
					email: string | null;
					email_log_id: string;
					entrega_estado: string;
					estado: Database['public']['Enums']['estado_email'];
					estado_envio: string;
					id: string;
					motivo: string | null;
					proveedor: string | null;
					provider_message_id: string | null;
					reserva_id: string | null;
					reservado_en: string | null;
					socio_id: string | null;
				}[];
				SetofOptions: {
					from: '*';
					to: 'email_destinatarios';
					isOneToOne: false;
					isSetofReturn: true;
				};
			};
			resolver_anulacion_fiscal: {
				Args: { p_actor_id?: string; p_ejecucion_id: string; p_resultado: Json; p_version: number };
				Returns: Json;
			};
			resolver_anulacion_sin_envio_fiscal: {
				Args: {
					p_actor_id: string;
					p_comprobante_id: string;
					p_ejecucion_id: string;
					p_version: number;
				};
				Returns: Json;
			};
			resolver_rechazo_anulado_fiscal: {
				Args: {
					p_actor_id: string;
					p_comprobante_id: string;
					p_ejecucion_id: string;
					p_version: number;
				};
				Returns: Json;
			};
			tramo_proporcional: {
				Args: { p_anio: number; p_fecha: string; p_mes: number };
				Returns: number;
			};
			usuarios_enlace_pendiente: {
				Args: { p_actor: string; p_usuario_id: string };
				Returns: boolean;
			};
			usuarios_operacion_guardar: {
				Args: {
					p_actor: string;
					p_enlace_enviado?: boolean;
					p_estado: string;
					p_lease: string;
					p_operacion_id: string;
					p_revocacion_pendiente?: boolean;
				};
				Returns: undefined;
			};
			usuarios_operacion_leer: {
				Args: { p_actor: string; p_operacion_id?: string; p_usuario_id?: string };
				Returns: Json;
			};
			usuarios_operacion_reservar: {
				Args: {
					p_actor: string;
					p_datos: Json;
					p_operacion_id: string;
					p_tipo: string;
					p_usuario_id: string;
				};
				Returns: Json;
			};
			usuarios_revocar_sesiones: {
				Args: { p_actor: string; p_usuario_id: string };
				Returns: undefined;
			};
		};
		Enums: {
			estado_basico: 'activo' | 'inactivo';
			estado_cuota: 'pendiente' | 'pagada';
			estado_email: 'enviado' | 'fallido' | 'procesando';
			estado_fiscal: 'valido' | 'pendiente_cae' | 'anulacion_pendiente' | 'anulado' | 'fallido';
			estado_gasto: 'activo' | 'anulado';
			estado_inscripcion: 'activa' | 'inactiva';
			estado_job: 'procesando' | 'exitoso' | 'fallido';
			estado_pago: 'completado' | 'anulado';
			medio_pago: 'efectivo' | 'transferencia';
			rol_usuario: 'admin' | 'responsable';
			tipo_comprobante: 'factura' | 'nota_credito';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema['Enums']
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema['CompositeTypes']
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	graphql_public: {
		Enums: {},
	},
	public: {
		Enums: {
			estado_basico: ['activo', 'inactivo'],
			estado_cuota: ['pendiente', 'pagada'],
			estado_email: ['enviado', 'fallido', 'procesando'],
			estado_fiscal: ['valido', 'pendiente_cae', 'anulacion_pendiente', 'anulado', 'fallido'],
			estado_gasto: ['activo', 'anulado'],
			estado_inscripcion: ['activa', 'inactiva'],
			estado_job: ['procesando', 'exitoso', 'fallido'],
			estado_pago: ['completado', 'anulado'],
			medio_pago: ['efectivo', 'transferencia'],
			rol_usuario: ['admin', 'responsable'],
			tipo_comprobante: ['factura', 'nota_credito'],
		},
	},
} as const;
