export type SocioDestinatario = {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
};

// Función pura: toma un array de socios y extrae solo los emails válidos
export const extraerEmails = (socios: readonly SocioDestinatario[]): string[] => {
  return socios
    .map(socio => socio.email)
    .filter(email => email !== null && email.includes("@"));
};

// Función pura: genera el HTML final aplicando una plantilla básica
export const formatearCuerpoCorreo = (cuerpoBase: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #0056b3;">Club Los Andes</h2>
      <div style="margin-top: 20px;">
        ${cuerpoBase}
      </div>
      <hr style="margin-top: 40px; border: none; border-top: 1px solid #eee;" />
      <p style="font-size: 12px; color: #999;">Este es un mensaje automático, por favor no respondas a este correo.</p>
    </div>
  `;
};