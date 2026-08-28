import React from 'react'

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large'
  text?: string
}

export function LoadingSpinner({ size = 'medium', text }: LoadingSpinnerProps) {
  const sizeMap = {
    small: '20px',
    medium: '40px',
    large: '60px'
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px'
    }}>
      <div style={{
        width: sizeMap[size],
        height: sizeMap[size],
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #007AFF',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      {text && (
        <p style={{ marginTop: '16px', color: '#666' }}>{text}</p>
      )}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}