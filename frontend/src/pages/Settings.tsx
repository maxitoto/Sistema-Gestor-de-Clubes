import { useState } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useGetAll, useUpdate, useCreate } from '#hooks/useCrud';

interface ClubConfig {
    id: string;
    nombre: string;
    cuit: string;
    domicilio_fiscal: string;
    punto_venta: number;
    logo_url: string | null;
    certificado_arca: string | null;
    certificado_key: string | null;
    certificado_vencimiento: string | null;
    updated_at: string | null;
}

export default function Settings() {
    const { data: configuraciones, isLoading, error } = useGetAll('club');

    if (isLoading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;
    if (error) return <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>Error al cargar la configuración</Alert>;

    const configActual = configuraciones?.[0];
    return <SettingsForm key={configActual?.id || 'new'} initialData={configActual || null} />;
}

function SettingsForm({ initialData }: { initialData: ClubConfig | null }) {
    const navigate = useNavigate();
    
    const { mutate: crearConfiguracion, isPending: isCreating } = useCreate('club');
    const { mutate: actualizarConfiguracion, isPending: isUpdating } = useUpdate('club');
    
    const esNuevo = !initialData;
    const isPending = isCreating || isUpdating;

    const [formData, setFormData] = useState({
        nombre: initialData?.nombre || '',
        cuit: initialData?.cuit || '',
        domicilio_fiscal: initialData?.domicilio_fiscal || '',
        punto_venta: initialData?.punto_venta || 1,
        logo_url: initialData?.logo_url || ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'number' ? Number(value) : value
        });
    };

    const handleGuardar = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (esNuevo) {
            crearConfiguracion(formData, {
                onSuccess: () => alert('¡Configuración creada exitosamente!')
            });
        } else {
            actualizarConfiguracion(
                { id: initialData.id, payload: formData },
                { onSuccess: () => alert('¡Configuración actualizada con éxito!') }
            );
        }
    };

    const handleVolver = () => navigate(-1);

    return (
        <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
                {esNuevo ? 'Crear Configuración Inicial' : 'Configuración del Club'}
            </Typography>

            {esNuevo && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    Aún no hay configuraciones guardadas. Completa los datos para inicializar el sistema.
                </Alert>
            )}

            <Box component="form" onSubmit={handleGuardar} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                    label="Nombre / Razón Social"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    fullWidth
                    required
                    disabled={isPending}
                />
                
                <TextField
                    label="CUIT"
                    name="cuit"
                    value={formData.cuit}
                    onChange={handleChange}
                    fullWidth
                    required
                    disabled={isPending}
                />
                
                <TextField
                    label="Domicilio Fiscal"
                    name="domicilio_fiscal"
                    value={formData.domicilio_fiscal}
                    onChange={handleChange}
                    fullWidth
                    required
                    disabled={isPending}
                />
                
                <TextField
                    label="Punto de Venta"
                    name="punto_venta"
                    type="number"
                    value={formData.punto_venta}
                    onChange={handleChange}
                    fullWidth
                    required
                    disabled={isPending}
                />

                <TextField
                    label="URL del Logo (Opcional)"
                    name="logo_url"
                    value={formData.logo_url}
                    onChange={handleChange}
                    fullWidth
                    disabled={isPending}
                />

                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                    <Button 
                        variant="outlined" 
                        color="inherit" 
                        onClick={handleVolver}
                        disabled={isPending}
                    >
                        Volver
                    </Button>
                    
                    <Button 
                        type="submit" 
                        variant="contained" 
                        color="primary"
                        disabled={isPending}
                    >
                        {isPending 
                            ? 'Guardando...' 
                            : esNuevo ? 'Crear Configuración' : 'Guardar Cambios'}
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
}