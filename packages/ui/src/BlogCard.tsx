import React from 'react'
import type { Prompt } from '@articlio/types'
import { formatDate, truncateText } from '@articlio/utils'

interface BlogCardProps {
  prompt: Prompt
  onClick?: () => void
}

export function BlogCard({ prompt, onClick }: BlogCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <h3 style={{ marginBottom: '8px' }}>{prompt.title}</h3>
      {prompt.category && (
        <span style={{
          backgroundColor: '#f0f0f0',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {prompt.category}
        </span>
      )}
      <p style={{ marginTop: '12px', color: '#666' }}>
        {truncateText(prompt.content, 150)}
      </p>
      <small style={{ color: '#999', marginTop: '8px', display: 'block' }}>
        {formatDate(prompt.created_at)}
      </small>
    </div>
  )
}