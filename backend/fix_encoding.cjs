// backend/fix_encoding.cjs — limpia datos con encoding corrupto en la DB
// (ocurrió porque la conexión no tenía charset utf8mb4 al seedear)
const { query } = require('./db.cjs');

async function main() {
  console.log('🔧 Limpiando encoding de datos…');

  // Categorías
  const categories = [
    { id: 1, name: 'Orgánico' },
    { id: 2, name: 'Plástico' },
    { id: 3, name: 'Cartón' },
    { id: 4, name: 'Vidrio / Botellas' },
    { id: 5, name: 'Papel' },
    { id: 6, name: 'Loza quebrada' },
    { id: 7, name: 'Cristalería rota' },
  ];
  for (const c of categories) {
    await query('UPDATE waste_categories SET name = ? WHERE id = ?', [c.name, c.id]);
  }
  console.log(`   ✓ ${categories.length} categorías`);

  // Áreas
  const areas = [
    { id: 1, name: 'Restaurante', description: 'Comedor principal' },
    { id: 2, name: 'Cocina',       description: 'Área de producción' },
    { id: 3, name: 'Bar' },
  ];
  for (const a of areas) {
    await query('UPDATE waste_areas SET name = ?, description = ? WHERE id = ?',
      [a.name, a.description || null, a.id]);
  }
  console.log(`   ✓ ${areas.length} áreas`);

  // Plan demo
  await query(
    `UPDATE reduction_plans
     SET title = 'Reducir plástico 25% en Restaurante',
         description = 'Cambiar a envases retornables y capacitar al personal'
     WHERE id = 1`,
  );
  // Steps
  const steps = [
    'Auditar proveedores de envases',
    'Capacitar al personal de servicio',
    'Cambiar a vasos retornables',
  ];
  for (let i = 0; i < steps.length; i++) {
    await query('UPDATE reduction_plan_steps SET title = ? WHERE plan_id = 1 AND step_order = ?',
      [steps[i], i + 1]);
  }
  console.log(`   ✓ plan y 3 pasos`);

  console.log('✅ Encoding corregido');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
