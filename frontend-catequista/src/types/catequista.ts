export interface AuthInfo {
  catequista: string;
  user: string;
  csrf_token: string;
}

export interface CatecumenoCompleto {
  name: string;
  fase: string | null;
  sexo: 'M' | 'F' | string | null;
  status: string;
  encarregado: string | null;
  contacto_encarregado: string | null;
  padrinhos: string | null;
  contacto_padrinhos: string | null;
  data_de_nascimento: string | null;
  idade: number | null;
  obs: string | null;
  row_name: string | null;
  total_presencas: number;
  total_faltas: number;
}

export interface TurmaComCatecumenos {
  name: string;
  fase: string;
  ano_lectivo: string | null;
  local: string | null;
  dia: string | null;
  hora: string | null;
  catequista: string;
  catequista_adj: string | null;
  status: string;
  catecumenos: CatecumenoCompleto[];
  total_catecumenos: number;
}

export interface FieldConfigItem {
  fieldname: string;
  label: string;
  fieldtype: string;
  options: string;
  show_in_table: boolean;
  show_in_panel: boolean;
  editable: boolean;
  column_width: 'xs' | 'sm' | 'md' | 'lg';
  panel_section: string;
  source: 'catecumeno' | 'turma_catecumenos' | 'turma';
  col_span: '1' | '2';
}
