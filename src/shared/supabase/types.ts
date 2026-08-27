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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      apprenant: {
        Row: {
          contact: string | null
          created_at: string
          date_inscription: string
          id: string
          niveau: string | null
          nom: string
          notes: string | null
          owner_id: string
          prenom: string
          statut: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          date_inscription?: string
          id?: string
          niveau?: string | null
          nom: string
          notes?: string | null
          owner_id?: string
          prenom: string
          statut?: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          date_inscription?: string
          id?: string
          niveau?: string | null
          nom?: string
          notes?: string | null
          owner_id?: string
          prenom?: string
          statut?: string
          updated_at?: string
        }
        Relationships: []
      }
      cours: {
        Row: {
          assiduite_active: boolean | null
          bareme_assiduite: number | null
          base_academique: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          devise: string
          format: string
          id: string
          jeton_partage: string | null
          libelle: string
          lien_meet: string | null
          logo: string | null
          owner_id: string
          penaliser_absences_excusees: boolean | null
          penalite_absence: number | null
          penalite_retard: number | null
          prix_mensuel: number | null
          statut: string
          type_cours_id: string
          updated_at: string
        }
        Insert: {
          assiduite_active?: boolean | null
          bareme_assiduite?: number | null
          base_academique?: string | null
          created_at?: string
          date_debut: string
          date_fin?: string | null
          devise?: string
          format: string
          id?: string
          jeton_partage?: string | null
          libelle: string
          lien_meet?: string | null
          logo?: string | null
          owner_id?: string
          penaliser_absences_excusees?: boolean | null
          penalite_absence?: number | null
          penalite_retard?: number | null
          prix_mensuel?: number | null
          statut?: string
          type_cours_id: string
          updated_at?: string
        }
        Update: {
          assiduite_active?: boolean | null
          bareme_assiduite?: number | null
          base_academique?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          devise?: string
          format?: string
          id?: string
          jeton_partage?: string | null
          libelle?: string
          lien_meet?: string | null
          logo?: string | null
          owner_id?: string
          penaliser_absences_excusees?: boolean | null
          penalite_absence?: number | null
          penalite_retard?: number | null
          prix_mensuel?: number | null
          statut?: string
          type_cours_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cours_type_cours_id_fkey"
            columns: ["type_cours_id"]
            isOneToOne: false
            referencedRelation: "type_cours"
            referencedColumns: ["id"]
          },
        ]
      }
      creneau: {
        Row: {
          cours_id: string
          created_at: string
          heure_debut: string
          heure_fin: string
          id: string
          jour_semaine: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          cours_id: string
          created_at?: string
          heure_debut: string
          heure_fin: string
          id?: string
          jour_semaine: number
          owner_id?: string
          updated_at?: string
        }
        Update: {
          cours_id?: string
          created_at?: string
          heure_debut?: string
          heure_fin?: string
          id?: string
          jour_semaine?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creneau_cours_id_fkey"
            columns: ["cours_id"]
            isOneToOne: false
            referencedRelation: "cours"
            referencedColumns: ["id"]
          },
        ]
      }
      inscription: {
        Row: {
          apprenant_id: string
          cours_id: string
          created_at: string
          examen_bareme: number | null
          id: string
          note_examen: number | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          apprenant_id: string
          cours_id: string
          created_at?: string
          examen_bareme?: number | null
          id?: string
          note_examen?: number | null
          owner_id?: string
          updated_at?: string
        }
        Update: {
          apprenant_id?: string
          cours_id?: string
          created_at?: string
          examen_bareme?: number | null
          id?: string
          note_examen?: number | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inscription_apprenant_id_fkey"
            columns: ["apprenant_id"]
            isOneToOne: false
            referencedRelation: "apprenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscription_cours_id_fkey"
            columns: ["cours_id"]
            isOneToOne: false
            referencedRelation: "cours"
            referencedColumns: ["id"]
          },
        ]
      }
      paiement: {
        Row: {
          cours_id: string
          created_at: string
          date_paiement: string | null
          id: string
          methode: string | null
          mois_concerne: string
          montant_du: number
          montant_recu: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          cours_id: string
          created_at?: string
          date_paiement?: string | null
          id?: string
          methode?: string | null
          mois_concerne: string
          montant_du: number
          montant_recu?: number
          owner_id?: string
          updated_at?: string
        }
        Update: {
          cours_id?: string
          created_at?: string
          date_paiement?: string | null
          id?: string
          methode?: string | null
          mois_concerne?: string
          montant_du?: number
          montant_recu?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paiement_cours_id_fkey"
            columns: ["cours_id"]
            isOneToOne: false
            referencedRelation: "cours"
            referencedColumns: ["id"]
          },
        ]
      }
      parametres: {
        Row: {
          assiduite_active: boolean
          bareme_academique: number
          bareme_assiduite: number
          base_academique: string
          created_at: string
          id: string
          logo: string | null
          note_bareme: number
          owner_id: string
          penaliser_absences_excusees: boolean
          penalite_absence: number
          penalite_retard: number
          updated_at: string
        }
        Insert: {
          assiduite_active?: boolean
          bareme_academique?: number
          bareme_assiduite?: number
          base_academique?: string
          created_at?: string
          id?: string
          logo?: string | null
          note_bareme?: number
          owner_id?: string
          penaliser_absences_excusees?: boolean
          penalite_absence?: number
          penalite_retard?: number
          updated_at?: string
        }
        Update: {
          assiduite_active?: boolean
          bareme_academique?: number
          bareme_assiduite?: number
          base_academique?: string
          created_at?: string
          id?: string
          logo?: string | null
          note_bareme?: number
          owner_id?: string
          penaliser_absences_excusees?: boolean
          penalite_absence?: number
          penalite_retard?: number
          updated_at?: string
        }
        Relationships: []
      }
      presence: {
        Row: {
          apprenant_id: string
          commentaire: string | null
          created_at: string
          etat: string | null
          id: string
          note: number | null
          note_bareme: number | null
          owner_id: string
          passage_evalue: string | null
          present: boolean
          seance_id: string
          updated_at: string
        }
        Insert: {
          apprenant_id: string
          commentaire?: string | null
          created_at?: string
          etat?: string | null
          id?: string
          note?: number | null
          note_bareme?: number | null
          owner_id?: string
          passage_evalue?: string | null
          present?: boolean
          seance_id: string
          updated_at?: string
        }
        Update: {
          apprenant_id?: string
          commentaire?: string | null
          created_at?: string
          etat?: string | null
          id?: string
          note?: number | null
          note_bareme?: number | null
          owner_id?: string
          passage_evalue?: string | null
          present?: boolean
          seance_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_apprenant_id_fkey"
            columns: ["apprenant_id"]
            isOneToOne: false
            referencedRelation: "apprenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_seance_id_fkey"
            columns: ["seance_id"]
            isOneToOne: false
            referencedRelation: "seance"
            referencedColumns: ["id"]
          },
        ]
      }
      seance: {
        Row: {
          contenu_aborde: string | null
          cours_id: string
          created_at: string
          date: string
          exercices_a_faire: string | null
          heure_debut: string
          heure_fin: string
          id: string
          observations: string | null
          owner_id: string
          sourate: string | null
          sourate_numero: number | null
          statut: string
          type_travail: string | null
          updated_at: string
          versets_a: number | null
          versets_de: number | null
        }
        Insert: {
          contenu_aborde?: string | null
          cours_id: string
          created_at?: string
          date: string
          exercices_a_faire?: string | null
          heure_debut: string
          heure_fin: string
          id?: string
          observations?: string | null
          owner_id?: string
          sourate?: string | null
          sourate_numero?: number | null
          statut?: string
          type_travail?: string | null
          updated_at?: string
          versets_a?: number | null
          versets_de?: number | null
        }
        Update: {
          contenu_aborde?: string | null
          cours_id?: string
          created_at?: string
          date?: string
          exercices_a_faire?: string | null
          heure_debut?: string
          heure_fin?: string
          id?: string
          observations?: string | null
          owner_id?: string
          sourate?: string | null
          sourate_numero?: number | null
          statut?: string
          type_travail?: string | null
          updated_at?: string
          versets_a?: number | null
          versets_de?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seance_cours_id_fkey"
            columns: ["cours_id"]
            isOneToOne: false
            referencedRelation: "cours"
            referencedColumns: ["id"]
          },
        ]
      }
      type_cours: {
        Row: {
          created_at: string
          id: string
          libelle: string
        }
        Insert: {
          created_at?: string
          id?: string
          libelle: string
        }
        Update: {
          created_at?: string
          id?: string
          libelle?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activer_partage: { Args: { p_cours_id: string }; Returns: string }
      cours_public: {
        Args: { jeton: string }
        Returns: {
          creneaux: Json
          date_debut: string
          date_fin: string
          dernier_exercice: string
          libelle: string
          lien_meet: string
          statut: string
          type_libelle: string
        }[]
      }
      enregistrer_cours: {
        Args: { p_cours: Json; p_cours_id?: string; p_creneaux: Json }
        Returns: {
          assiduite_active: boolean | null
          bareme_assiduite: number | null
          base_academique: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          devise: string
          format: string
          id: string
          jeton_partage: string | null
          libelle: string
          lien_meet: string | null
          logo: string | null
          owner_id: string
          penaliser_absences_excusees: boolean | null
          penalite_absence: number | null
          penalite_retard: number | null
          prix_mensuel: number | null
          statut: string
          type_cours_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cours"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regenerer_partage: { Args: { p_cours_id: string }; Returns: string }
      revoquer_partage: { Args: { p_cours_id: string }; Returns: undefined }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
