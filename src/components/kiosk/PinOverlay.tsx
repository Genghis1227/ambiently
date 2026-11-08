import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Mail, X } from 'lucide-react';
import { getCurrentUser, sendPinResetCode, verifyOtpCode } from '../../services/supabase';
import { useDashboardStore } from '../../store/dashboardStore';

interface PinOverlayProps {
  onUnlock: (pin: string) => boolean | Promise<boolean>;
  /** Called after a forgotten PIN was removed with a code sent to the account's email */
  onPinRemoved: () => void;
  title?: string;
  subtitle?: string;
  onCancel?: () => void;
}

// A forgotten PIN is removed with a code emailed to the account this screen is signed in to, so only
// someone who can read that inbox can get past it. Without cloud sign-in there's no way around it here.
type Recovery =
  | { step: 'closed' }
  | { step: 'checking' }
  | { step: 'no-account' }
  | { step: 'send'; email: string }
  | { step: 'code'; email: string };

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(name.length - 1, 6)))}@${domain}`;
}

export const PinOverlay: React.FC<PinOverlayProps> = ({
  onUnlock,
  onPinRemoved,
  title = 'Kiosk Locked',
  subtitle = 'Enter parent PIN to proceed',
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [recovery, setRecovery] = useState<Recovery>({ step: 'closed' });
  const [resetCode, setResetCode] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isRecoveryBusy, setIsRecoveryBusy] = useState(false);

  const checkPin = useCallback(async (currentPin: string) => {
    setIsVerifying(true);
    setErrorMsg('');
    try {
      const success = await onUnlock(currentPin);
      if (!success) {
        setErrorMsg('Incorrect PIN. Try again.');
        setPin('');
      }
    } catch {
      setErrorMsg('Verification error');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  }, [onUnlock]);

  const handleDigit = useCallback((digit: string) => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (next.length >= 4) {
        checkPin(next);
      }
      return next;
    });
  }, [isVerifying, checkPin]);

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  }, [isVerifying]);

  const handleClear = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin('');
  }, [isVerifying]);

  // Keyboard number listener for desktop / connected keyboards
  useEffect(() => {
    if (recovery.step !== 'closed') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, onCancel, recovery.step]);

  const openRecovery = async () => {
    setRecoveryMessage('');
    setResetCode('');
    setRecovery({ step: 'checking' });
    const user = await getCurrentUser().catch(() => null);
    setRecovery(user?.email ? { step: 'send', email: user.email } : { step: 'no-account' });
  };

  const sendCode = async (email: string) => {
    setIsRecoveryBusy(true);
    setRecoveryMessage('');
    const res = await sendPinResetCode(email);
    setIsRecoveryBusy(false);
    if (res.success) {
      setRecovery({ step: 'code', email });
    } else {
      setRecoveryMessage(res.error || 'Could not send the code. Try again.');
    }
  };

  const confirmCode = async (email: string) => {
    const code = resetCode.replace(/\D/g, '');
    if (code.length < 6) {
      setRecoveryMessage('Enter the 6-digit code from the email.');
      return;
    }
    setIsRecoveryBusy(true);
    setRecoveryMessage('');
    const res = await verifyOtpCode(email, code);
    if (!res.success) {
      setIsRecoveryBusy(false);
      setRecoveryMessage(res.error || 'That code is wrong or has expired.');
      return;
    }
    // Removes the PIN and the kiosk locks; a new PIN can be set in Settings
    await useDashboardStore.getState().setPinLock(null);
    setIsRecoveryBusy(false);
    onPinRemoved();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onCancel) {
          onCancel();
        }
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-150"
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            title="Cancel and return to dashboard"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 text-blue-400 shadow-sm">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
        <p className="text-sm text-gray-400 mb-5">{subtitle}</p>

        {/* PIN Indicator Dots */}
        <div className="flex gap-3 mb-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                errorMsg
                  ? 'bg-red-500/40 border-red-500 animate-pulse'
                  : idx < pin.length
                  ? 'bg-blue-500 border-blue-400 scale-110 shadow-sm shadow-blue-500/50'
                  : 'bg-gray-800 border-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="h-5 mb-3 flex items-center justify-center">
          {errorMsg ? (
            <span className="text-xs text-red-400 font-medium">{errorMsg}</span>
          ) : isVerifying ? (
            <span className="text-xs text-blue-400 font-medium animate-pulse">Verifying PIN...</span>
          ) : null}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full mb-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isVerifying}
              onClick={() => handleDigit(num)}
              className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white transition-all shadow-inner disabled:opacity-50 cursor-pointer"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={isVerifying}
            onClick={handleClear}
            className="h-14 rounded-xl bg-gray-800/40 hover:bg-gray-800 active:scale-95 text-sm font-medium text-gray-400 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={isVerifying}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white transition-all shadow-inner disabled:opacity-50 cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            disabled={isVerifying}
            onClick={handleBackspace}
            className="h-14 rounded-xl bg-gray-800/40 hover:bg-gray-800 active:scale-95 text-sm font-medium text-gray-400 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            ⌫
          </button>
        </div>

        {/* Forgotten PIN: removed with a code emailed to the signed-in account */}
        <div className="w-full pt-4 border-t border-gray-800/80 flex flex-col items-center gap-2 text-left">
          {recovery.step === 'closed' && (
            <button
              type="button"
              onClick={openRecovery}
              className="w-full py-2.5 px-4 rounded-xl bg-gray-800/90 hover:bg-gray-800 text-xs text-gray-400 hover:text-gray-300 font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              Forgot PIN?
            </button>
          )}

          {recovery.step === 'checking' && <span className="text-xs text-gray-400">Checking this screen's account...</span>}

          {recovery.step === 'no-account' && (
            <p className="text-xs text-gray-400">
              This screen isn't signed in to cloud sync, so its PIN can't be reset here. Clearing this site's data in
              the browser's settings removes the PIN, along with the board saved on this screen.
            </p>
          )}

          {recovery.step === 'send' && (
            <>
              <p className="text-xs text-gray-400 w-full">
                We'll email a 6-digit code to {maskEmail(recovery.email)}, the account this screen is signed in to.
                Entering it removes the PIN and the kiosk locks.
              </p>
              <button
                type="button"
                disabled={isRecoveryBusy}
                onClick={() => sendCode(recovery.email)}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs text-white font-semibold transition-all cursor-pointer"
              >
                {isRecoveryBusy ? 'Sending...' : 'Email me a code'}
              </button>
            </>
          )}

          {recovery.step === 'code' && (
            <>
              <p className="text-xs text-gray-400 w-full">Enter the 6-digit code sent to {maskEmail(recovery.email)}.</p>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmCode(recovery.email);
                  }}
                  placeholder="123456"
                  aria-label="Code from the email"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-gray-950 border border-gray-700 text-sm text-white tracking-widest focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  disabled={isRecoveryBusy}
                  onClick={() => confirmCode(recovery.email)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs text-white font-semibold transition-all cursor-pointer"
                >
                  {isRecoveryBusy ? 'Checking...' : 'Remove PIN'}
                </button>
              </div>
            </>
          )}

          {recoveryMessage && <span className="text-xs text-red-400 w-full">{recoveryMessage}</span>}
        </div>
      </div>
    </div>
  );
};
