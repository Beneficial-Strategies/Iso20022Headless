import { z, type ZodType } from 'zod';
import type { MessageBundle } from './generated/registry.ts';
import type { FieldDescriptor } from './runtime.ts';

/** The name of the optional group that holds the Business Application Header in the form values of a message. */
export const APPLICATION_HEADER = 'ApplicationHeader';

/**
 * The message with the Business Application Header offered as one more optional group, first in the message: its root type gains an
 * optional component `ApplicationHeader` (of the header's own type), its schema accepts it, and the header's types and schemas join the
 * message's. Everything that walks the root type (the form, validation, business rules, zoom) then treats the header like any other
 * optional part. Serializing the values with the header in an envelope is `@beneficial-strategies/iso20022-serialize`'s job.
 *
 * `message` is the original, untouched: serializing with it leaves the header group out (use the envelope functions to include it).
 * Not meant for the header message itself.
 */
export function withApplicationHeader(bundle: MessageBundle, header: MessageBundle): MessageBundle {
  const rootType = bundle.message.rootType;
  const root = bundle.typeDescriptors[rootType];
  const rootSchema = bundle.schemas[rootType] as (ZodType & { extend?: (shape: Record<string, ZodType>) => ZodType }) | undefined;
  if (!root?.fields || !rootSchema) throw new Error(`${bundle.message.identifier} has no root type to add a header to`);
  const headerType = header.message.rootType;
  const field: FieldDescriptor = {
    name: APPLICATION_HEADER,
    ...(header.typeDescriptors[headerType]?.isoId ? { isoId: header.typeDescriptors[headerType]!.isoId! } : {}),
    xmlTag: header.message.rootTag,
    displayName: 'Business Application Header',
    kind: 'component',
    type: headerType,
    required: false,
  };
  const headerSchema = header.schemas[headerType]!.optional();
  const schema = typeof rootSchema.extend === 'function' ? rootSchema.extend({ [APPLICATION_HEADER]: headerSchema }) : z.intersection(z.object({ [APPLICATION_HEADER]: headerSchema }), rootSchema);
  const typeDescriptors = { ...header.typeDescriptors, ...bundle.typeDescriptors, [rootType]: { ...root, fields: [field, ...root.fields] } };
  return {
    message: bundle.message,
    schemas: { ...header.schemas, ...bundle.schemas, [rootType]: schema },
    typeDescriptors,
  };
}
