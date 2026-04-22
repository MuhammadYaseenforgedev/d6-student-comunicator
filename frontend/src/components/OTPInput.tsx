import { useMemo, useRef } from "react";

type OTPInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
};

function normalizeOtp(value: string, length: number): string[] {
  const digits = value.replace(/\D+/g, "").slice(0, length).split("");
  while (digits.length < length) digits.push("");
  return digits;
}

export default function OTPInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  id = "otp",
  name = "otp",
}: OTPInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = useMemo(() => normalizeOtp(value, length), [length, value]);

  function setOtpDigits(nextDigits: string[]) {
    onChange(nextDigits.join("").slice(0, length));
  }

  function focusIndex(index: number) {
    const target = inputRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  }

  function handleChange(index: number, rawValue: string) {
    const sanitized = rawValue.replace(/\D+/g, "");
    if (!sanitized) {
      const nextDigits = [...digits];
      nextDigits[index] = "";
      setOtpDigits(nextDigits);
      return;
    }

    const nextDigits = [...digits];
    const incoming = sanitized.slice(0, length - index).split("");

    incoming.forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });

    setOtpDigits(nextDigits);

    const nextIndex = Math.min(index + incoming.length, length - 1);
    focusIndex(nextIndex);
  }

  function handleKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Backspace") {
      event.preventDefault();

      if (digits[index]) {
        const nextDigits = [...digits];
        nextDigits[index] = "";
        setOtpDigits(nextDigits);
        return;
      }

      if (index > 0) {
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        setOtpDigits(nextDigits);
        focusIndex(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusIndex(index - 1);
      return;
    }

    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      focusIndex(index + 1);
    }
  }

  function handlePaste(
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>
  ) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D+/g, "");
    if (!pasted) return;

    const nextDigits = [...digits];
    pasted
      .slice(0, length - index)
      .split("")
      .forEach((digit, offset) => {
        nextDigits[index + offset] = digit;
      });

    setOtpDigits(nextDigits);
    focusIndex(Math.min(index + pasted.length, length - 1));
  }

  return (
    <div className="flex w-full items-center justify-center gap-1.5 sm:gap-2">
      {digits.map((digit, index) => (
        <input
          key={`${name}-${index}`}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          id={index === 0 ? id : `${id}-${index}`}
          name={index === 0 ? name : `${name}-${index}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`OTP digit ${index + 1}`}
          maxLength={1}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          className="input-glass h-10 w-10 shrink-0 px-0 text-center text-base font-semibold sm:h-11 sm:w-11"
        />
      ))}
    </div>
  );
}
