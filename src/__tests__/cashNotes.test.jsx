import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CashNotes from '../components/CashNotes';

describe('CashNotes', () => {
  it('totals notes and coins as you tap', () => {
    const onTotal = vi.fn();
    render(<CashNotes onTotal={onTotal} />);
    fireEvent.click(screen.getByLabelText('More 500'));
    fireEvent.click(screen.getByLabelText('More 500'));
    fireEvent.click(screen.getByLabelText('More 100'));
    expect(onTotal).toHaveBeenLastCalledWith(1100);
    fireEvent.click(screen.getByLabelText('Less 500'));
    expect(onTotal).toHaveBeenLastCalledWith(600);
    fireEvent.click(screen.getByLabelText('Less 50'));
    expect(onTotal).toHaveBeenLastCalledWith(600);
  });
});
