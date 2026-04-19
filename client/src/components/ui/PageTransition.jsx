// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";

/**
 * Envolve conteúdo de ecrã/tab com transição suave de entrada e saída.
 * @param {{ tabKey: string, children: React.ReactNode }} props
 */
export function PageTransition({ tabKey, children }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Anima a entrada de uma lista de itens em cascata (stagger).
 * Cada filho deve ter o className 'stagger-item' ou ser um <motion.div>.
 * @param {{ children: React.ReactNode, className?: string }} props
 */
export function StaggerList({ children, className = "" }) {
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.06,
      },
    },
  };
  const itemVariants = {
    // eslint-disable-line no-unused-vars
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  };

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
