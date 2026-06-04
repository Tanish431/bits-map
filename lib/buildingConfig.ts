import type { ExpressionSpecification } from 'maplibre-gl';

export type BuildingCategory = 'hostel' | 'academic' | 'mess' | 'library' | 'ltc' | 'sac';

export interface BuildingConfig {
  osmName: string;
  category: BuildingCategory;
  height: number;
}

export const BUILDING_COLORS: Record<BuildingCategory, string> = {
  hostel:   '#3b82f6',  // blue
  academic: '#8b5cf6',  // purple
  mess:     '#f97316',  // orange
  library:  '#22c55e',  // green
  ltc:      '#ec4899',  // pink
  sac:      '#22c55e'
};

export const BUILDING_OPACITY = 0.55;

export const BUILDINGS: BuildingConfig[] = [
  // Hostels
  { osmName: 'Ashok bhawan',                  category: 'hostel',   height: 14 },
  { osmName: 'Bhagirath Bhawan',              category: 'hostel',   height: 14 },
  { osmName: 'Budh Bhawan',                   category: 'hostel',   height: 14 },
  { osmName: 'Gandhi Bhawan',                 category: 'hostel',   height: 14 },
  { osmName: 'Krishna Bhawan',                category: 'hostel',   height: 14 },
  { osmName: 'Malviya-A',                     category: 'hostel',   height: 14 },
  { osmName: 'Malviya-B',                     category: 'hostel',   height: 14 },
  { osmName: 'Meera Bhawan',                  category: 'hostel',   height: 14 },
  { osmName: 'Ram Bhawan',                    category: 'hostel',   height: 14 },
  { osmName: 'Rana Pratap Bhawan',            category: 'hostel',   height: 14 },
  { osmName: 'Shankar Bhawan',                category: 'hostel',   height: 14 },
  { osmName: 'Srinivas Ramanujan Hostel',     category: 'hostel',   height: 18 },
  { osmName: 'C.V. Raman Bhawan',             category: 'hostel',   height: 14 },
  { osmName: 'Vishwakarma Bhawan',            category: 'hostel',   height: 18 },
  { osmName: 'Vyas Bhawan',                   category: 'hostel',   height: 14 },

  // Academic
  { osmName: 'FD 1',                          category: 'academic', height: 20 },
  { osmName: 'FD 2',                          category: 'academic', height: 20 },
  { osmName: 'FD-2 & FD-3',                          category: 'academic', height: 20 },
  { osmName: 'New Academic Block',            category: 'academic', height: 20 },
  { osmName: 'New Academic Building',         category: 'academic', height: 20 },
  { osmName: 'NAB',                           category: 'academic', height: 20 },
  { osmName: 'Department of Pharmacy',        category: 'academic', height: 16 },
  { osmName: 'Rakesh Kapoor Innovation Centre', category: 'academic', height: 16 },
  { osmName: 'New BITS Workshop',                  category: 'academic', height: 12 },
  { osmName: 'new workshop',                  category: 'academic', height: 12 },

  // Mess
  { osmName: 'KG mess',                       category: 'mess',     height: 8  },
  { osmName: 'RP mess',                       category: 'mess',     height: 8  },
  { osmName: 'Ram-Budh mess',                 category: 'mess',     height: 8  },
  { osmName: 'Malviya Mess',                  category: 'mess',     height: 8  },
  { osmName: 'Shankar Vyas Mess',             category: 'mess',     height: 8  },
  { osmName: 'VKB mess',                      category: 'mess',     height: 8  },

  // Misc
  { osmName: 'BITS Library',                  category: 'library',  height: 22 },
  { osmName: 'Lecture Theatre Complex',       category: 'ltc',      height: 16 },
  { osmName: 'Student Activity Center (SAC)',      category: 'sac',      height: 16}
];

export const SELECTED_NAMES = new Set(BUILDINGS.map(b => b.osmName));

export function buildColorExpression(): ExpressionSpecification {
  const expr: unknown[] = ['match', ['get', 'name']];
  for (const b of BUILDINGS) {
    expr.push(b.osmName, BUILDING_COLORS[b.category]);
  }
  expr.push('#334155'); // default grey for everything else
  return expr as ExpressionSpecification;
}

export function buildHeightExpression(): ExpressionSpecification {
  const expr: unknown[] = ['match', ['get', 'name']];
  for (const b of BUILDINGS) {
    expr.push(b.osmName, b.height);
  }
  expr.push(0);
  return expr as ExpressionSpecification;
}

export function buildOpacityExpression(
  selectedOpacity: number,
  defaultOpacity: number
): ExpressionSpecification {
  const expr: unknown[] = ['match', ['get', 'name']];
  for (const b of BUILDINGS) {
    expr.push(b.osmName, selectedOpacity);
  }
  expr.push(defaultOpacity);
  return expr as ExpressionSpecification;
}
