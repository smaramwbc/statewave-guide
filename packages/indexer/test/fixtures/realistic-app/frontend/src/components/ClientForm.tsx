/**
 * The create-client form.
 *
 * This module is the middle of the flagship flow: the form element carries the
 * `data-guide`, `handleSubmit(submitClient)` names the handler, and
 * `submitClient` reaches `clientService.create` through a module-scope alias.
 */
import { useForm } from 'react-hook-form';
import { Button } from './primitives/Button';
import { TextField } from './primitives/TextField';
import { clientService as clientsApi } from '../services/clientService';
import { DRAFT_STORAGE_KEY } from '../lib/constants';
import type { Client, ClientDraft, PlanTier } from '../types/client';

/** Props of {@link ClientForm}. */
export interface ClientFormProps {
  onCreated: (client: Client) => void;
  onCancel: () => void;
}

/** The shape react-hook-form manages. */
interface ClientFormValues {
  name: string;
  email: string;
  plan: PlanTier;
}

/**
 * A module-scope alias of a service member, reached through a *renamed*
 * import.
 *
 * Resolvable, but only by way of the import graph: nothing in this file spells
 * `clientService`. `create` is bound once, at module scope, to a member of an
 * imported object literal, and nothing reassigns it.
 */
const create = clientsApi.create;

/** The create-client form. */
export function ClientForm({ onCreated, onCancel }: ClientFormProps) {
  const { register, handleSubmit, setError, formState } = useForm<ClientFormValues>({
    defaultValues: { name: '', email: '', plan: 'team' },
  });

  /** Turns validated form values into a draft and posts it. */
  const submitClient = async (values: ClientFormValues): Promise<void> => {
    const draft: ClientDraft = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      plan: values.plan,
    };
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    try {
      const created = await create(draft);
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      onCreated(created);
    } catch (cause) {
      // One retry through the endpoint table: the same endpoint, described
      // rather than called, so neither a method nor a path is named here.
      if (cause instanceof Error && cause.message.includes('timeout')) {
        onCreated(await clientsApi.createFromSpec(draft));
        return;
      }
      setError('root', { message: cause instanceof Error ? cause.message : 'Could not create the client' });
    }
  };

  return (
    <form className="client-form" data-guide="clients.create-dialog.form" onSubmit={handleSubmit(submitClient)}>
      <TextField
        data-guide="clients.create-dialog.name"
        label="Name"
        placeholder="Acme Inc."
        error={formState.errors.name !== undefined ? 'A name is required' : undefined}
        {...register('name', { required: true, maxLength: 120 })}
      />
      <TextField
        data-guide="clients.create-dialog.email"
        label="Billing email"
        type="email"
        error={formState.errors.email !== undefined ? 'A valid email is required' : undefined}
        {...register('email', { required: true })}
      />
      <label className="field" htmlFor="client-plan">
        <span className="field__label">Plan</span>
        <select id="client-plan" data-guide="clients.create-dialog.plan" {...register('plan')}>
          <option value="free">Free</option>
          <option value="team">Team</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </label>
      {formState.errors.root !== undefined ? (
        <p className="form__error" role="alert">
          {formState.errors.root.message}
        </p>
      ) : null}
      <footer className="client-form__footer">
        <Button data-guide="clients.create-dialog.cancel" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          data-guide="clients.create-dialog.submit"
          type="submit"
          variant="primary"
          loading={formState.isSubmitting}
        >
          Create client
        </Button>
      </footer>
    </form>
  );
}
