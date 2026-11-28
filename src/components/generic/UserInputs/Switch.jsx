import { forwardRef } from "react";

import "./Switch.css";

/**
 * Interrupteur on/off facon iOS. Meme utilisation que CheckBox (label,
 * checked, onChange(event) avec event.target.checked, id, disabled...), pour
 * pouvoir le remplacer sans toucher a la logique.
 *
 * Une vraie case a cocher (role="switch") reste dans le DOM, cachee : clavier,
 * lecteurs d'ecran et formulaires fonctionnent comme avant.
 */
const Switch = forwardRef(function Switch({ label, checked, onChange, id = "", className = "", onMouseEnter, onMouseLeave, ...props }, propRef) {
    const inputId = `${id}-input`;
    return (
        <label className={`switch ${className}`.trim()} id={id} htmlFor={inputId} ref={propRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            {label ? <span className="text-label">{label}</span> : null}
            <input
                type="checkbox"
                role="switch"
                id={inputId}
                className="switch-input"
                checked={!!checked}
                onChange={(event) => onChange?.(event)}
                readOnly={!onChange}
                {...props}
            />
            <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
            </span>
        </label>
    );
});

export default Switch;
