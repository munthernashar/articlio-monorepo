import { describe, expect, it, vi } from 'vitest';
import { Navigate, Outlet } from 'react-router-dom';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: useAuthMock,
}));

import { AdminRoute } from '@/features/auth/AdminRoute';
import { paths } from '@/app/routes/paths';

describe('AdminRoute', () => {
  it('rendert Outlet wenn Context isAdmin=true ist', () => {
    useAuthMock.mockReturnValue({ status: 'authenticated', isAdmin: true });

    const element = AdminRoute();

    expect(element.type).toBe(Outlet);
  });

  it('navigiert zum Dashboard wenn Context isAdmin=false ist', () => {
    useAuthMock.mockReturnValue({ status: 'authenticated', isAdmin: false });

    const element = AdminRoute();

    expect(element.type).toBe(Navigate);
    expect(element.props.to).toBe(paths.dashboard);
    expect(element.props.replace).toBe(true);
  });
});
