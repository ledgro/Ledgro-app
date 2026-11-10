import { motion } from 'framer-motion';

// Soft rise-and-fade entrance. Only used on content, never around fixed-position elements.
export default function Reveal({ children, i = 0, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: Math.min(i, 8) * 0.06, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
