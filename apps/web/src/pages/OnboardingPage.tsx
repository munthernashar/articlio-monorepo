import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function OnboardingPage() {
  const [step, setStep] = useState(1)
  const navigate = useNavigate()

  function handleNext() {
    if (step < 3) setStep(step + 1)
    else navigate('/dashboard')
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: i <= step ? '#007AFF' : '#e0e0e0',
                borderRadius: '2px'
              }}
            />
          ))}
        </div>
        <p style={{ textAlign: 'center', color: '#666' }}>Schritt {step} von 3</p>
      </div>

      {step === 1 && (
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Willkommen bei Articlio!</h1>
          <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '2rem' }}>
            Lass uns dein Lernprofil erstellen.
          </p>
          <button onClick={handleNext} style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}>Weiter</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Was möchtest du lernen?</h2>
          <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
            {['Sprachen', 'Mathematik', 'Programmierung', 'Wissenschaft', 'Andere'].map(subject => (
              <label key={subject} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '1rem',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>
                <input type="checkbox" style={{ marginRight: '0.75rem' }} />
                {subject}
              </label>
            ))}
          </div>
          <button onClick={handleNext} style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}>Weiter</button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Wie viel Zeit pro Tag?</h2>
          <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
            {['15 Minuten', '30 Minuten', '1 Stunde', '2+ Stunden'].map(time => (
              <label key={time} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '1rem',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>
                <input type="radio" name="time" style={{ marginRight: '0.75rem' }} />
                {time}
              </label>
            ))}
          </div>
          <button onClick={handleNext} style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}>Fertigstellen</button>
        </div>
      )}
    </div>
  )
}