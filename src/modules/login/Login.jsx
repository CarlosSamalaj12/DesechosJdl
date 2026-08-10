import { useState } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Trash2, LogIn, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../auth/AuthContext.jsx';
import './Login.css';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } });

  const [authError, setAuthError] = useState(null);

  if (user) {
    const target = from || (user.role === 'admin' ? '/admin' : '/operator');
    return <Navigate to={target} replace />;
  }

  async function onSubmit({ email, password }) {
    setAuthError(null);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Bienvenido, ${u.full_name}`);
      const target = from || (u.role === 'admin' ? '/admin' : '/operator');
      navigate(target, { replace: true });
    } catch (err) {
      setAuthError(err.message || 'No se pudo iniciar sesión');
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <Trash2 size={32} strokeWidth={2.2} />
          </div>
          <h1>Desperdicios JDL</h1>
          <p>Control de residuos · Jardines del Lago</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
          {authError && (
            <div className="login-error">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <label className="field">
            <span>Correo</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="tu@correo.com"
              {...register('email', {
                required: 'Ingresa tu correo',
                pattern: { value: /.+@.+\..+/, message: 'Correo inválido' },
              })}
            />
            {errors.email && <small className="field-error">{errors.email.message}</small>}
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password', {
                required: 'Ingresa tu contraseña',
                minLength: { value: 4, message: 'Mínimo 4 caracteres' },
              })}
            />
            {errors.password && <small className="field-error">{errors.password.message}</small>}
          </label>

          <button type="submit" className="login-submit" disabled={isSubmitting}>
            <LogIn size={18} />
            <span>{isSubmitting ? 'Entrando…' : 'Entrar'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
