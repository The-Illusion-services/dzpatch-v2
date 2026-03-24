import { Colors, Typography, Spacing, Radius, Shadow, Layout } from '@/constants/theme';

describe('Design System — Theme Constants', () => {
  describe('Colors', () => {
    it('has required primary colors', () => {
      expect(Colors.primary).toBe('#2563EB');
      expect(Colors.textPrimary).toBe('#0D1B2A');
      expect(Colors.background).toBe('#F5F7FA');
      expect(Colors.surface).toBe('#FFFFFF');
    });

    it('has all order status colors', () => {
      expect(Colors.statusPending).toBeDefined();
      expect(Colors.statusMatched).toBeDefined();
      expect(Colors.statusInTransit).toBeDefined();
      expect(Colors.statusDelivered).toBeDefined();
      expect(Colors.statusCancelled).toBeDefined();
    });

    it('has semantic status colors with light variants', () => {
      expect(Colors.success).toBeDefined();
      expect(Colors.successLight).toBeDefined();
      expect(Colors.error).toBeDefined();
      expect(Colors.errorLight).toBeDefined();
      expect(Colors.warning).toBeDefined();
      expect(Colors.warningLight).toBeDefined();
    });
  });

  describe('Typography', () => {
    it('has a scale from xs to 4xl', () => {
      expect(Typography.xs).toBeLessThan(Typography.sm);
      expect(Typography.sm).toBeLessThan(Typography.base);
      expect(Typography.base).toBeLessThan(Typography.md);
      expect(Typography.md).toBeLessThan(Typography.lg);
      expect(Typography.lg).toBeLessThan(Typography.xl);
    });

    it('has all font weight constants', () => {
      expect(Typography.regular).toBe('400');
      expect(Typography.medium).toBe('500');
      expect(Typography.semibold).toBe('600');
      expect(Typography.bold).toBe('700');
    });
  });

  describe('Spacing', () => {
    it('follows 4px grid', () => {
      expect(Spacing[1]).toBe(4);
      expect(Spacing[2]).toBe(8);
      expect(Spacing[4]).toBe(16);
      expect(Spacing[8]).toBe(32);
    });
  });

  describe('Layout', () => {
    it('has standard screen constants', () => {
      expect(Layout.screenPaddingH).toBe(20);
      expect(Layout.inputHeight).toBe(52);
      expect(Layout.buttonHeightLg).toBe(56);
    });
  });

  describe('Shadow', () => {
    it('has elevation values for each tier', () => {
      expect(Shadow.sm.elevation).toBeLessThan(Shadow.md.elevation);
      expect(Shadow.md.elevation).toBeLessThan(Shadow.lg.elevation);
    });
  });
});
