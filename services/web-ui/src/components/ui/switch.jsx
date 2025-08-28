import * as SwitchPrimitive from "@radix-ui/react-switch"

export function Switch({ checked, onCheckedChange }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="w-12 h-6 bg-gray-600 rounded-full relative data-[state=checked]:bg-green-600"
    >
      <SwitchPrimitive.Thumb className="block w-5 h-5 bg-white rounded-full shadow-md transition-transform translate-x-1 data-[state=checked]:translate-x-6" />
    </SwitchPrimitive.Root>
  )
}
