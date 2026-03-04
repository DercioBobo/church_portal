export interface Turma {
  name: string;
  fase: string;
  ano_lectivo: string;
  local: string;
  dia: string;
  hora: string;
  catequista: string;
  catequista_adj?: string;
  total_catecumenos: number;
}

export interface TurmaDetalhe extends Omit<Turma, 'total_catecumenos'> {
  status: string;
  total_catecumenos: number;
  catecumenos: CatecumenoBasico[];
}

export interface CatecumenoBasico {
  catecumeno: string;
  status: string;
  total_presencas?: number;
  total_faltas?: number;
}

export interface Catecumeno {
  name: string;
  fase: string;
  turma: string;
  encarregado: string;
  sexo: string;
  status: string;
  local?: string;
  dia?: string;
  hora?: string;
  catequista?: string;
  catequista_adj?: string;
  found_via?: string; // 'encarregado' when matched via guardian name
}

export interface Aniversariante {
  name: string;
  fase: string;
  turma: string;
  local: string;
  catequista: string;
  idade: number;
  idade_nova: number;
  data_aniversario: string; // MM-DD
}

export interface Estatisticas {
  total_catecumenos: number;
  total_turmas: number;
  total_catequistas: number;
  por_fase: { fase: string; total: number }[];
}

export interface PreparacaoSacramentoLista {
  name: string;
  sacramento: string;
  ano_lectivo: string;
  data_do_sacramento: string;
  total_candidatos: number;
}

export interface CandidatoSacramento {
  name: string;
  catecumeno: string;
  turma?: string;
  fase?: string;
  sexo?: string;
  idade?: number;
  data_de_nascimento?: string;
  date?: string;
  dia?: string;
  sacerdote?: string;
  encarregado?: string;
  contacto_encarregado?: string;
  padrinhos?: string;
  contacto_padrinhos?: string;
  ficha?: 0 | 1;
  documentos_padrinhos?: 0 | 1;
  valor_ofertorio?: number;
  valor_cracha?: number;
  valor_accao_gracas?: number;
  valor_fotos?: number;
  obs?: string;
  enc_obs?: string;
}

export interface PreparacaoSacramento extends PreparacaoSacramentoLista {
  documentos_exigidos?: string;
  valor_ofertorio?: number;
  valor_cracha?: number;
  observacoes?: string;
  candidatos: CandidatoSacramento[];
}

export interface ResultadoPesquisa {
  catecumenos: Catecumeno[];
  catequistas: {
    catequista: string;
    catequista_adj?: string;
    turma: string;
    fase: string;
    local: string;
    dia: string;
    hora: string;
    status?: string;
  }[];
}
