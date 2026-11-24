"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { STATES } from "@/lib/bureaus/codes";
import { stateFromPin } from "@/lib/pincode";

/** PIN code, then state. The state is filled in from the PIN code unless the person has chosen one. */
export function PinStateFields({
  values,
  errors,
}: {
  values?: { pincode?: string; state?: string };
  errors: Record<string, string>;
}) {
  const [state, setState] = useState(values?.state ?? "");
  const [chosenBy, setChosenBy] = useState<"pin" | "person" | null>(values?.state ? "person" : null);

  const onPin = (pin: string) => {
    if (chosenBy === "person") return;
    const found = stateFromPin(pin);
    setState(found ?? "");
    setChosenBy(found ? "pin" : null);
  };

  return (
    <>
      <Field label="PIN code" error={errors.pincode}>
        <input
          name="pincode"
          defaultValue={values?.pincode}
          onChange={(ev) => onPin(ev.target.value.trim())}
          placeholder="560038"
          inputMode="numeric"
          maxLength={6}
          autoComplete="postal-code"
          className={inputClass}
        />
      </Field>
      <Field label="State" error={state ? undefined : errors.state} hint={chosenBy === "pin" ? "Filled from the PIN code" : undefined}>
        <select
          name="state"
          value={state}
          onChange={(ev) => {
            setState(ev.target.value);
            setChosenBy("person");
          }}
          className={inputClass}
        >
          <option value="" disabled>
            Select
          </option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
