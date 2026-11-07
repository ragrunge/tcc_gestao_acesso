export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  api: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auditoria_alteracoes: { Args: { p?: Json }; Returns: Json }
      auditoria_cadeia: { Args: { p?: Json }; Returns: Json }
      auditoria_exportar: { Args: { p?: Json }; Returns: Json }
      autorizacao_criar: { Args: { p: Json }; Returns: Json }
      autorizacao_revogar: { Args: { p_id: string }; Returns: undefined }
      autorizacoes_hoje: { Args: never; Returns: Json }
      autorizacoes_previstas: { Args: { p_horas?: number }; Returns: Json }
      autorizacoes_vigentes: {
        Args: { p_area_comum?: boolean; p_destino: string; p_pessoa: string }
        Returns: Json
      }
      busca_global: { Args: { p: Json }; Returns: Json }
      catalogo: { Args: never; Returns: Json }
      encomenda_autorizar_retirada: {
        Args: { p: Json; p_id: string }
        Returns: Json
      }
      encomenda_entregar: {
        Args: { p_id: string; p_pessoa: string }
        Returns: Json
      }
      encomenda_obter: { Args: { p_id: string }; Returns: Json }
      encomenda_receber: { Args: { p: Json }; Returns: Json }
      encomendas_listar: { Args: { p?: Json }; Returns: Json }
      encomendas_resumo: { Args: { p_dias?: number }; Returns: Json }
      evento_correcoes: { Args: { p_id: string }; Returns: Json }
      evento_corrigir: { Args: { p: Json; p_evento: string }; Returns: Json }
      evento_entrada: { Args: { p: Json }; Returns: Json }
      evento_obter: { Args: { p_id: string }; Returns: Json }
      evento_prorrogar: { Args: { p_entrada: string }; Returns: Json }
      evento_recusa: { Args: { p: Json }; Returns: Json }
      evento_saida: { Args: { p?: Json; p_entrada: string }; Returns: Json }
      evento_ultimo_veiculo: { Args: { p_pessoa: string }; Returns: Json }
      eventos_listar: { Args: { p?: Json }; Returns: Json }
      eventos_presentes: { Args: never; Returns: Json }
      funcionario_criar: { Args: { p: Json }; Returns: Json }
      funcionario_editar: { Args: { p: Json; p_id: string }; Returns: Json }
      funcionarios_listar: { Args: { p?: Json }; Returns: Json }
      importacao_analisar: { Args: { p: Json }; Returns: Json }
      importacao_confirmar: { Args: { p: Json; p_id: string }; Returns: Json }
      ocorrencia_alterar_status: {
        Args: { p_id: string; p_status: string }
        Returns: Json
      }
      ocorrencia_criar: { Args: { p: Json }; Returns: Json }
      ocorrencia_obter: { Args: { p_id: string }; Returns: Json }
      ocorrencia_vincular_eventos: {
        Args: { p: Json; p_id: string }
        Returns: Json
      }
      ocorrencias_listar: { Args: { p?: Json }; Returns: Json }
      ocorrencias_resumo: { Args: never; Returns: Json }
      pessoa_criar: { Args: { p: Json }; Returns: Json }
      pessoa_desativar: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      pessoa_editar: { Args: { p: Json; p_id: string }; Returns: Json }
      pessoa_ficha: { Args: { p_id: string }; Returns: Json }
      pessoa_funcionario: { Args: { p_id: string }; Returns: Json }
      pessoa_reativar: { Args: { p_id: string }; Returns: Json }
      pessoas_buscar: { Args: { p: Json }; Returns: Json }
      pessoas_listar: { Args: { p?: Json }; Returns: Json }
      pessoas_resumo: { Args: never; Returns: Json }
      relatorio_resumo: { Args: { p?: Json }; Returns: Json }
      restricao_aprovar: { Args: { p_id: string }; Returns: Json }
      restricao_criar: { Args: { p: Json }; Returns: Json }
      restricao_revogar: { Args: { p_id: string }; Returns: undefined }
      restricao_verificar: {
        Args: { p_pessoa: string; p_unidade?: string }
        Returns: Json
      }
      restricoes_pendentes: { Args: never; Returns: Json }
      sessao_atual: { Args: never; Returns: Json }
      sessao_encerrar: { Args: never; Returns: undefined }
      turno_resumo: { Args: never; Returns: Json }
      unidade_criar: { Args: { p: Json }; Returns: Json }
      unidade_desativar: { Args: { p_id: string }; Returns: Json }
      unidade_detalhe: { Args: { p_ref: string }; Returns: Json }
      unidade_editar: { Args: { p: Json; p_id: string }; Returns: Json }
      unidade_reativar: { Args: { p_id: string }; Returns: Json }
      unidades_listar: { Args: { p?: Json }; Returns: Json }
      unidades_resumo: { Args: never; Returns: Json }
      usuarios_listar: { Args: { p?: Json }; Returns: Json }
      usuarios_resumo: { Args: never; Returns: Json }
      veiculo_criar: { Args: { p: Json }; Returns: Json }
      veiculo_editar: { Args: { p: Json; p_id: string }; Returns: Json }
      vinculo_aprovar: { Args: { p_id: string }; Returns: Json }
      vinculo_conferir: { Args: { p: Json; p_id: string }; Returns: Json }
      vinculo_criar: { Args: { p: Json }; Returns: Json }
      vinculo_encerrar: { Args: { p?: Json; p_id: string }; Returns: Json }
      vinculo_regularizar: { Args: { p?: Json; p_id: string }; Returns: Json }
      vinculo_rejeitar: { Args: { p?: Json; p_id: string }; Returns: Json }
      vinculos_autorizadores: { Args: { p_unidade: string }; Returns: Json }
      vinculos_contar: { Args: { p_status: string }; Returns: number }
      vinculos_listar: { Args: { p?: Json }; Returns: Json }
      vinculos_resumo: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  api: {
    Enums: {},
  },
} as const
