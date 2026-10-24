import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmHost from '../components/ConfirmHost';
import { confirm } from '../lib/confirm';

describe('ConfirmHost', () => {
  it('shows the sheet and resolves true on confirm, false on cancel', async () => {
    render(<ConfirmHost />);
    const p1 = confirm({ title: 'Void?', message: 'Sure', confirmText: 'Void', danger: true });
    fireEvent.click(await screen.findByText('Void'));
    expect(await p1).toBe(true);
    await waitFor(() => expect(screen.queryByText('Sure')).toBeNull());
    const p2 = confirm({ message: 'Again' });
    fireEvent.click(await screen.findByText('Cancel'));
    expect(await p2).toBe(false);
  });
});
